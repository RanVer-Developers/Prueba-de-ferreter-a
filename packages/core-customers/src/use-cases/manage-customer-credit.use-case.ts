import { z } from 'zod';
import {
  CustomerEventPublisher,
  DefaultIdGenerator,
  IClock,
  ICustomerRepository,
  IIdGenerator,
  SystemClock,
} from '../contracts/customer-contracts.js';
import { CustomerPublicSummary } from '../domain/entities/customer.js';
import { CustomerNotFoundError } from '../domain/errors/customer-errors.js';
import { CreditAgingSummary } from '../domain/services/credit-aging.service.js';
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  assertCustomerFeatureEnabled,
  isCustomerFeatureEnabled,
  resolveCustomerFeatures,
} from '../domain/services/customer-features.js';
import {
  CreditLedgerEntry,
  CurrencyCodeSchema,
  NonEmptyIdSchema,
  parseWithCustomerSchema,
} from '../schemas/customer.schemas.js';

const ConfigureCreditSchema = z.object({
  customerId: NonEmptyIdSchema,
  creditLimitCents: z.number().int().min(0),
  creditTermDays: z.number().int().min(0).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

const ChargeCreditSchema = z.object({
  customerId: NonEmptyIdSchema,
  amountCents: z.number().int().positive(),
  currency: CurrencyCodeSchema.optional(),
  referenceId: z.string().trim().min(1).optional(),
  dueAt: z.date().optional(),
  notes: z.string().trim().min(1).optional(),
  performedBy: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  enforceOverdueHold: z.boolean().default(false),
  expectedVersion: z.number().int().min(0).optional(),
});

const RecordCreditPaymentSchema = z.object({
  customerId: NonEmptyIdSchema,
  amountCents: z.number().int().positive(),
  currency: CurrencyCodeSchema.optional(),
  type: z.enum(['PAYMENT', 'ADJUSTMENT_CREDIT', 'WRITE_OFF']).default('PAYMENT'),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  performedBy: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type ConfigureCreditInput = z.input<typeof ConfigureCreditSchema>;
export type ChargeCreditInput = z.input<typeof ChargeCreditSchema>;
export type RecordCreditPaymentInput = z.input<typeof RecordCreditPaymentSchema>;

export interface ManageCustomerCreditDeps {
  customerRepo: ICustomerRepository;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  featureProfile?: CustomerFeatureProfile;
}

export class ManageCustomerCreditUseCase {
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly features: CustomerFeatureFlags;

  constructor(private readonly deps: ManageCustomerCreditDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.idGenerator = deps.idGenerator ?? DefaultIdGenerator;
    this.features = resolveCustomerFeatures(deps.featureProfile);
  }

  private async getCustomer(id: string) {
    const cleanId = parseWithCustomerSchema(NonEmptyIdSchema, id, 'customerId');
    const customer = await this.deps.customerRepo.findById(cleanId);
    if (!customer) throw new CustomerNotFoundError(cleanId);
    return customer;
  }

  public async configureCredit(rawInput: ConfigureCreditInput): Promise<CustomerPublicSummary> {
    assertCustomerFeatureEnabled(this.features, 'creditAccounts');
    const input = parseWithCustomerSchema(ConfigureCreditSchema, rawInput, 'configure credit input');
    const customer = await this.getCustomer(input.customerId);
    const now = this.clock.now();

    customer.configureCredit(
      { creditLimitCents: input.creditLimitCents, creditTermDays: input.creditTermDays },
      now
    );

    const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.customerRepo.save(customer, expectedVersion);
    return customer.toPublicSummary();
  }

  public async charge(
    rawInput: ChargeCreditInput
  ): Promise<{ customer: CustomerPublicSummary; entry: CreditLedgerEntry | null; isReplay: boolean }> {
    assertCustomerFeatureEnabled(this.features, 'creditAccounts');
    const input = parseWithCustomerSchema(ChargeCreditSchema, rawInput, 'charge credit input');
    if (input.enforceOverdueHold) {
      assertCustomerFeatureEnabled(this.features, 'creditAgingAndHolds');
    }

    const customer = await this.getCustomer(input.customerId);
    const useIdempotency = isCustomerFeatureEnabled(this.features, 'offlineIdempotency');
    const idempKey = useIdempotency ? input.idempotencyKey : undefined;

    if (idempKey && customer.hasProcessedOperation(idempKey, 'credit:charge')) {
      const existing = customer.creditLedger.find((e) => e.idempotencyKey === idempKey) ?? null;
      return { customer: customer.toPublicSummary(), entry: existing, isReplay: true };
    }

    const now = this.clock.now();
    const entry = customer.recordCreditCharge({
      entryId: this.idGenerator.nextId('cred'),
      amountCents: input.amountCents,
      currency: input.currency,
      referenceId: input.referenceId,
      dueAt: input.dueAt,
      notes: input.notes,
      performedBy: input.performedBy,
      idempotencyKey: idempKey,
      enforceOverdueHold: input.enforceOverdueHold,
      now,
    });

    const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.customerRepo.save(customer, expectedVersion);

    await this.deps.publishEvent?.({
      type: 'CustomerCreditCharged',
      customerId: customer.id,
      amountCents: input.amountCents,
      balanceAfterCents: customer.creditBalanceCents,
      referenceId: input.referenceId,
      occurredAt: now.toISOString(),
    });

    return { customer: customer.toPublicSummary(), entry, isReplay: false };
  }

  public async recordPayment(
    rawInput: RecordCreditPaymentInput
  ): Promise<{ customer: CustomerPublicSummary; entry: CreditLedgerEntry | null; isReplay: boolean }> {
    assertCustomerFeatureEnabled(this.features, 'creditAccounts');
    const input = parseWithCustomerSchema(
      RecordCreditPaymentSchema,
      rawInput,
      'record credit payment input'
    );

    const customer = await this.getCustomer(input.customerId);
    const useIdempotency = isCustomerFeatureEnabled(this.features, 'offlineIdempotency');
    const idempKey = useIdempotency ? input.idempotencyKey : undefined;

    if (idempKey && customer.hasProcessedOperation(idempKey, 'credit:payment')) {
      const existing = customer.creditLedger.find((e) => e.idempotencyKey === idempKey) ?? null;
      return { customer: customer.toPublicSummary(), entry: existing, isReplay: true };
    }

    const now = this.clock.now();
    const entry = customer.recordCreditPayment({
      entryId: this.idGenerator.nextId('cpay'),
      amountCents: input.amountCents,
      currency: input.currency,
      type: input.type,
      referenceId: input.referenceId,
      notes: input.notes,
      performedBy: input.performedBy,
      idempotencyKey: idempKey,
      now,
    });

    const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.customerRepo.save(customer, expectedVersion);

    await this.deps.publishEvent?.({
      type: 'CustomerCreditPaymentRecorded',
      customerId: customer.id,
      amountCents: input.amountCents,
      balanceAfterCents: customer.creditBalanceCents,
      referenceId: input.referenceId,
      occurredAt: now.toISOString(),
    });

    return { customer: customer.toPublicSummary(), entry, isReplay: false };
  }

  public async setFrozen(
    customerId: string,
    frozen: boolean,
    reason?: string
  ): Promise<CustomerPublicSummary> {
    assertCustomerFeatureEnabled(this.features, 'creditAccounts');
    assertCustomerFeatureEnabled(this.features, 'creditAgingAndHolds');

    const customer = await this.getCustomer(customerId);
    const now = this.clock.now();
    if (frozen) {
      customer.freezeCredit(reason ?? 'Manual credit hold', now);
    } else {
      customer.unfreezeCredit(now);
    }
    await this.deps.customerRepo.save(customer);

    await this.deps.publishEvent?.({
      type: 'CustomerCreditFrozen',
      customerId: customer.id,
      frozen,
      reason,
      occurredAt: now.toISOString(),
    });

    return customer.toPublicSummary();
  }

  public async getAgingSummary(customerId: string): Promise<CreditAgingSummary> {
    assertCustomerFeatureEnabled(this.features, 'creditAccounts');
    assertCustomerFeatureEnabled(this.features, 'creditAgingAndHolds');
    const customer = await this.getCustomer(customerId);
    return customer.getCreditAging(this.clock.now());
  }
}

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
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  assertCustomerFeatureEnabled,
  isCustomerFeatureEnabled,
  resolveCustomerFeatures,
} from '../domain/services/customer-features.js';
import {
  CurrencyCodeSchema,
  NonEmptyIdSchema,
  WalletLedgerEntry,
  parseWithCustomerSchema,
} from '../schemas/customer.schemas.js';

const WalletDepositSchema = z.object({
  customerId: NonEmptyIdSchema,
  amountCents: z.number().int().positive(),
  currency: CurrencyCodeSchema.optional(),
  type: z.enum(['DEPOSIT', 'REFUND_CREDIT']).default('DEPOSIT'),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

const WalletSpendSchema = z.object({
  customerId: NonEmptyIdSchema,
  amountCents: z.number().int().positive(),
  currency: CurrencyCodeSchema.optional(),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type WalletDepositInput = z.input<typeof WalletDepositSchema>;
export type WalletSpendInput = z.input<typeof WalletSpendSchema>;

export interface ManageCustomerWalletDeps {
  customerRepo: ICustomerRepository;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  featureProfile?: CustomerFeatureProfile;
}

export class ManageCustomerWalletUseCase {
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly features: CustomerFeatureFlags;

  constructor(private readonly deps: ManageCustomerWalletDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.idGenerator = deps.idGenerator ?? DefaultIdGenerator;
    this.features = resolveCustomerFeatures(deps.featureProfile);
  }

  public async deposit(
    rawInput: WalletDepositInput
  ): Promise<{ customer: CustomerPublicSummary; entry: WalletLedgerEntry | null; isReplay: boolean }> {
    assertCustomerFeatureEnabled(this.features, 'prepaidWallet');
    const input = parseWithCustomerSchema(WalletDepositSchema, rawInput, 'wallet deposit input');

    const customer = await this.deps.customerRepo.findById(input.customerId);
    if (!customer) throw new CustomerNotFoundError(input.customerId);

    const useIdempotency = isCustomerFeatureEnabled(this.features, 'offlineIdempotency');
    const idempKey = useIdempotency ? input.idempotencyKey : undefined;

    if (idempKey && customer.hasProcessedOperation(idempKey, 'wallet:deposit')) {
      const existing = customer.walletLedger.find((e) => e.idempotencyKey === idempKey) ?? null;
      return { customer: customer.toPublicSummary(), entry: existing, isReplay: true };
    }

    const now = this.clock.now();
    const entry = customer.depositWallet({
      entryId: this.idGenerator.nextId('wdep'),
      amountCents: input.amountCents,
      currency: input.currency,
      type: input.type,
      referenceId: input.referenceId,
      notes: input.notes,
      idempotencyKey: idempKey,
      now,
    });

    const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.customerRepo.save(customer, expectedVersion);

    await this.deps.publishEvent?.({
      type: 'CustomerWalletDeposited',
      customerId: customer.id,
      amountCents: input.amountCents,
      balanceAfterCents: customer.walletBalanceCents,
      referenceId: input.referenceId,
      occurredAt: now.toISOString(),
    });

    return { customer: customer.toPublicSummary(), entry, isReplay: false };
  }

  public async spend(
    rawInput: WalletSpendInput
  ): Promise<{ customer: CustomerPublicSummary; entry: WalletLedgerEntry | null; isReplay: boolean }> {
    assertCustomerFeatureEnabled(this.features, 'prepaidWallet');
    const input = parseWithCustomerSchema(WalletSpendSchema, rawInput, 'wallet spend input');

    const customer = await this.deps.customerRepo.findById(input.customerId);
    if (!customer) throw new CustomerNotFoundError(input.customerId);

    const useIdempotency = isCustomerFeatureEnabled(this.features, 'offlineIdempotency');
    const idempKey = useIdempotency ? input.idempotencyKey : undefined;

    if (idempKey && customer.hasProcessedOperation(idempKey, 'wallet:spend')) {
      const existing = customer.walletLedger.find((e) => e.idempotencyKey === idempKey) ?? null;
      return { customer: customer.toPublicSummary(), entry: existing, isReplay: true };
    }

    const now = this.clock.now();
    const entry = customer.spendWallet({
      entryId: this.idGenerator.nextId('wspn'),
      amountCents: input.amountCents,
      currency: input.currency,
      referenceId: input.referenceId,
      notes: input.notes,
      idempotencyKey: idempKey,
      now,
    });

    const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.customerRepo.save(customer, expectedVersion);

    await this.deps.publishEvent?.({
      type: 'CustomerWalletSpent',
      customerId: customer.id,
      amountCents: input.amountCents,
      balanceAfterCents: customer.walletBalanceCents,
      referenceId: input.referenceId,
      occurredAt: now.toISOString(),
    });

    return { customer: customer.toPublicSummary(), entry, isReplay: false };
  }
}

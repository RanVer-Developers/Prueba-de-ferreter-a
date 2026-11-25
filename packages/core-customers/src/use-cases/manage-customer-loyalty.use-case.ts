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
import { DEFAULT_LOYALTY_POLICY, LoyaltyPolicy } from '../domain/services/loyalty-policy.service.js';
import {
  LoyaltyLedgerEntry,
  NonEmptyIdSchema,
  parseWithCustomerSchema,
} from '../schemas/customer.schemas.js';

const EarnLoyaltySchema = z.object({
  customerId: NonEmptyIdSchema,
  spentCents: z.number().int().min(0),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

const RedeemLoyaltySchema = z.object({
  customerId: NonEmptyIdSchema,
  pointsToRedeem: z.number().int().positive(),
  purchaseAmountCents: z.number().int().min(0).optional(),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type EarnLoyaltyInput = z.input<typeof EarnLoyaltySchema>;
export type RedeemLoyaltyInput = z.input<typeof RedeemLoyaltySchema>;

export interface ManageCustomerLoyaltyDeps {
  customerRepo: ICustomerRepository;
  policy?: LoyaltyPolicy;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  featureProfile?: CustomerFeatureProfile;
}

export class ManageCustomerLoyaltyUseCase {
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly policy: LoyaltyPolicy;
  private readonly features: CustomerFeatureFlags;

  constructor(private readonly deps: ManageCustomerLoyaltyDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.idGenerator = deps.idGenerator ?? DefaultIdGenerator;
    this.policy = deps.policy ?? DEFAULT_LOYALTY_POLICY;
    this.features = resolveCustomerFeatures(deps.featureProfile);
  }

  public async earnFromPurchase(rawInput: EarnLoyaltyInput): Promise<{
    customer: CustomerPublicSummary;
    pointsEarned: number;
    tierCode: string;
    entry: LoyaltyLedgerEntry | null;
    isReplay: boolean;
  }> {
    assertCustomerFeatureEnabled(this.features, 'loyaltyPoints');
    const input = parseWithCustomerSchema(EarnLoyaltySchema, rawInput, 'earn loyalty input');

    const customer = await this.deps.customerRepo.findById(input.customerId);
    if (!customer) throw new CustomerNotFoundError(input.customerId);

    const useIdempotency = isCustomerFeatureEnabled(this.features, 'offlineIdempotency');
    const idempKey = useIdempotency ? input.idempotencyKey : undefined;

    if (idempKey && customer.hasProcessedOperation(idempKey, 'loyalty:earn')) {
      const existing = customer.loyaltyLedger.find((e) => e.idempotencyKey === idempKey) ?? null;
      return {
        customer: customer.toPublicSummary(),
        pointsEarned: existing?.pointsDelta ?? 0,
        tierCode: customer.loyaltyTierCode,
        entry: existing,
        isReplay: true,
      };
    }

    const now = this.clock.now();
    const applyTiers = isCustomerFeatureEnabled(this.features, 'loyaltyTiers');
    const enableExpiration = isCustomerFeatureEnabled(this.features, 'loyaltyExpiration');

    const res = customer.earnLoyaltyFromPurchase({
      entryId: this.idGenerator.nextId('loy'),
      lotId: this.idGenerator.nextId('llot'),
      spentCents: input.spentCents,
      policy: this.policy,
      applyTiers,
      enableExpiration,
      referenceId: input.referenceId,
      notes: input.notes,
      idempotencyKey: idempKey,
      now,
    });

    if (res.pointsEarned > 0) {
      const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
        ? input.expectedVersion
        : undefined;
      await this.deps.customerRepo.save(customer, expectedVersion);

      await this.deps.publishEvent?.({
        type: 'CustomerLoyaltyEarned',
        customerId: customer.id,
        points: res.pointsEarned,
        balanceAfter: customer.loyaltyPointsBalance,
        tierCode: res.tierCode,
        occurredAt: now.toISOString(),
      });
    }

    return {
      customer: customer.toPublicSummary(),
      pointsEarned: res.pointsEarned,
      tierCode: res.tierCode,
      entry: res.entry,
      isReplay: false,
    };
  }

  public async redeem(rawInput: RedeemLoyaltyInput): Promise<{
    customer: CustomerPublicSummary;
    redeemedPoints: number;
    discountCents: number;
    entry: LoyaltyLedgerEntry | null;
    isReplay: boolean;
  }> {
    assertCustomerFeatureEnabled(this.features, 'loyaltyPoints');
    const input = parseWithCustomerSchema(RedeemLoyaltySchema, rawInput, 'redeem loyalty input');

    const customer = await this.deps.customerRepo.findById(input.customerId);
    if (!customer) throw new CustomerNotFoundError(input.customerId);

    const useIdempotency = isCustomerFeatureEnabled(this.features, 'offlineIdempotency');
    const idempKey = useIdempotency ? input.idempotencyKey : undefined;

    if (idempKey && customer.hasProcessedOperation(idempKey, 'loyalty:redeem')) {
      const existing = customer.loyaltyLedger.find((e) => e.idempotencyKey === idempKey) ?? null;
      const pts = existing ? Math.abs(existing.pointsDelta) : input.pointsToRedeem;
      return {
        customer: customer.toPublicSummary(),
        redeemedPoints: pts,
        discountCents: existing?.discountCents ?? pts * this.policy.centsPerPointRedeemed,
        entry: existing,
        isReplay: true,
      };
    }

    const now = this.clock.now();
    const res = customer.redeemLoyaltyPoints({
      entryId: this.idGenerator.nextId('lred'),
      pointsToRedeem: input.pointsToRedeem,
      purchaseAmountCents: input.purchaseAmountCents,
      policy: this.policy,
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
      type: 'CustomerLoyaltyRedeemed',
      customerId: customer.id,
      points: res.redeemedPoints,
      valueCents: res.discountCents,
      balanceAfter: customer.loyaltyPointsBalance,
      occurredAt: now.toISOString(),
    });

    return {
      customer: customer.toPublicSummary(),
      redeemedPoints: res.redeemedPoints,
      discountCents: res.discountCents,
      entry: res.entry,
      isReplay: false,
    };
  }

  public async expirePoints(customerId: string): Promise<{
    customer: CustomerPublicSummary;
    expiredPoints: number;
  }> {
    assertCustomerFeatureEnabled(this.features, 'loyaltyPoints');
    assertCustomerFeatureEnabled(this.features, 'loyaltyExpiration');

    const cleanId = parseWithCustomerSchema(NonEmptyIdSchema, customerId, 'customerId');
    const customer = await this.deps.customerRepo.findById(cleanId);
    if (!customer) throw new CustomerNotFoundError(cleanId);

    const now = this.clock.now();
    const expiredPoints = customer.expireLoyaltyPoints(this.idGenerator.nextId('lexp'), now);
    if (expiredPoints > 0) {
      await this.deps.customerRepo.save(customer);
      await this.deps.publishEvent?.({
        type: 'CustomerLoyaltyExpired',
        customerId: customer.id,
        expiredPoints,
        balanceAfter: customer.loyaltyPointsBalance,
        occurredAt: now.toISOString(),
      });
    }

    return {
      customer: customer.toPublicSummary(),
      expiredPoints,
    };
  }
}

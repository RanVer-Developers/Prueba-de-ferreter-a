import { InvalidCustomerInputError } from '../errors/customer-errors.js';
import { divideHalfEven } from '../value-objects/money.js';

export interface LoyaltyTierDefinition {
  code: string;
  name: string;
  minLifetimePoints: number;
  earnMultiplier: number; // e.g., 1.0, 1.25, 1.5
}

export interface LoyaltyPolicy {
  /** Base cents spent required to earn 1 point (e.g., 1000 cents = $10 -> 1 point). */
  centsPerPointEarned: number;
  /** Cents of discount granted per 1 redeemed point (e.g., 100 cents = $1 per point). */
  centsPerPointRedeemed: number;
  minRedeemPoints?: number;
  /** Max percentage (0..100) of purchase subtotal payable with points. */
  maxRedeemPercentOfPurchase?: number;
  pointsExpirationDays?: number;
  tiers?: ReadonlyArray<LoyaltyTierDefinition>;
}

export const DEFAULT_LOYALTY_POLICY: LoyaltyPolicy = {
  centsPerPointEarned: 1000, // 1 point per 10.00 currency units
  centsPerPointRedeemed: 100, // 1 point = 1.00 currency unit
  minRedeemPoints: 10,
  maxRedeemPercentOfPurchase: 100,
  tiers: [
    { code: 'STANDARD', name: 'Standard', minLifetimePoints: 0, earnMultiplier: 1.0 },
    { code: 'SILVER', name: 'Silver', minLifetimePoints: 500, earnMultiplier: 1.25 },
    { code: 'GOLD', name: 'Gold', minLifetimePoints: 2000, earnMultiplier: 1.5 },
  ],
};

export function resolveLoyaltyTier(
  lifetimePoints: number,
  tiers: ReadonlyArray<LoyaltyTierDefinition> = DEFAULT_LOYALTY_POLICY.tiers ?? []
): LoyaltyTierDefinition {
  if (!Number.isFinite(lifetimePoints) || lifetimePoints < 0) {
    throw new InvalidCustomerInputError('lifetimePoints must be a non-negative finite number.');
  }
  if (tiers.length === 0) {
    return { code: 'STANDARD', name: 'Standard', minLifetimePoints: 0, earnMultiplier: 1.0 };
  }
  for (const tier of tiers) {
    if (!Number.isFinite(tier.minLifetimePoints) || tier.minLifetimePoints < 0) {
      throw new InvalidCustomerInputError(`Tier '${tier.code}' minLifetimePoints must be non-negative.`);
    }
    if (!Number.isFinite(tier.earnMultiplier) || tier.earnMultiplier < 0 || tier.earnMultiplier > 100) {
      throw new InvalidCustomerInputError(
        `Tier '${tier.code}' earnMultiplier must be a finite number between 0 and 100.`
      );
    }
  }
  const sorted = [...tiers].sort((a, b) => b.minLifetimePoints - a.minLifetimePoints);
  return sorted.find((t) => lifetimePoints >= t.minLifetimePoints) ?? sorted[sorted.length - 1];
}

export function calculatePointsToEarn(params: {
  spentCents: number;
  policy: LoyaltyPolicy;
  lifetimePoints?: number;
  applyTiers?: boolean;
}): { points: number; multiplierApplied: number; tierCode: string } {
  const { spentCents, policy, lifetimePoints = 0, applyTiers = true } = params;
  if (!Number.isSafeInteger(spentCents) || spentCents < 0) {
    throw new InvalidCustomerInputError('spentCents must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(policy.centsPerPointEarned) || policy.centsPerPointEarned <= 0) {
    throw new InvalidCustomerInputError('centsPerPointEarned must be a positive integer.');
  }
  if (spentCents === 0) {
    const tier = resolveLoyaltyTier(lifetimePoints, policy.tiers);
    return { points: 0, multiplierApplied: applyTiers ? tier.earnMultiplier : 1.0, tierCode: tier.code };
  }

  const tier = applyTiers
    ? resolveLoyaltyTier(lifetimePoints, policy.tiers)
    : { code: 'STANDARD', name: 'Standard', minLifetimePoints: 0, earnMultiplier: 1.0 };

  const SCALE = 10_000n;
  const scaledMultiplier = BigInt(Math.round(tier.earnMultiplier * 10_000));
  const rawPointsBig = (BigInt(spentCents) * scaledMultiplier) / (BigInt(policy.centsPerPointEarned) * SCALE);
  const rawPoints = Number(rawPointsBig);
  if (!Number.isSafeInteger(rawPoints)) {
    throw new InvalidCustomerInputError('Calculated earned points exceed safe integer range.');
  }

  return {
    points: Math.max(0, rawPoints),
    multiplierApplied: tier.earnMultiplier,
    tierCode: tier.code,
  };
}

export function calculateRedemptionValueCents(params: {
  pointsToRedeem: number;
  policy: LoyaltyPolicy;
  purchaseAmountCents?: number;
}): number {
  const { pointsToRedeem, policy, purchaseAmountCents } = params;
  if (!Number.isSafeInteger(pointsToRedeem) || pointsToRedeem <= 0) {
    throw new InvalidCustomerInputError('pointsToRedeem must be a positive integer.');
  }
  if (!Number.isSafeInteger(policy.centsPerPointRedeemed) || policy.centsPerPointRedeemed <= 0) {
    throw new InvalidCustomerInputError('centsPerPointRedeemed must be a positive integer.');
  }
  if (
    policy.minRedeemPoints !== undefined &&
    (!Number.isSafeInteger(policy.minRedeemPoints) || policy.minRedeemPoints < 0)
  ) {
    throw new InvalidCustomerInputError('minRedeemPoints must be a non-negative integer.');
  }
  if (policy.minRedeemPoints !== undefined && pointsToRedeem < policy.minRedeemPoints) {
    throw new InvalidCustomerInputError(
      `Minimum points required to redeem is ${policy.minRedeemPoints}.`
    );
  }

  const grossValueCents = pointsToRedeem * policy.centsPerPointRedeemed;
  if (!Number.isSafeInteger(grossValueCents)) {
    throw new InvalidCustomerInputError('Redemption value exceeds safe integer range.');
  }
  if (purchaseAmountCents !== undefined) {
    if (!Number.isSafeInteger(purchaseAmountCents) || purchaseAmountCents < 0) {
      throw new InvalidCustomerInputError('purchaseAmountCents must be a non-negative integer.');
    }
    const maxPct = policy.maxRedeemPercentOfPurchase ?? 100;
    if (typeof maxPct !== 'number' || !Number.isFinite(maxPct) || maxPct < 0 || maxPct > 100) {
      throw new InvalidCustomerInputError('maxRedeemPercentOfPurchase must be between 0 and 100.');
    }
    const maxAllowedCents = divideHalfEven(
      BigInt(purchaseAmountCents) * BigInt(Math.round(maxPct * 100)),
      10_000n
    );
    if (grossValueCents > maxAllowedCents) {
      throw new InvalidCustomerInputError(
        `Redemption value (${grossValueCents} cents) exceeds allowed cap (${maxAllowedCents} cents) for this purchase.`
      );
    }
  }

  return grossValueCents;
}

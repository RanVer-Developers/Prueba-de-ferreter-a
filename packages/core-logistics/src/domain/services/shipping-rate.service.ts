import { Money, multiplyCentsHalfEven } from '@modulos/core-shared';
import {
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
  PackageSpec,
  QuoteShippingInput,
  QuoteShippingInputSchema,
  ShippingRateRule,
  ShippingRateRuleSchema,
  parseOrThrowLogisticsInput,
} from '../../schemas/logistics-schemas.js';
import {
  FeatureDisabledError,
  ShippingRateError,
} from '../errors/logistics-errors.js';

export interface ShippingQuoteResult {
  ruleId: string;
  ruleName: string;
  strategy: ShippingRateRule['strategy'];
  amount: Money;
  freeShippingApplied: boolean;
  actualWeightGrams: number;
  volumetricWeightGrams: number;
  billableWeightGrams: number;
}

/**
 * Pure domain service for computing shipping fees in integer cents.
 */
export class ShippingRateService {
  static calculatePackageWeights(
    packages: ReadonlyArray<PackageSpec>,
    volumetricDivisor: number
  ): { actualWeightGrams: number; volumetricWeightGrams: number; billableWeightGrams: number } {
    let actualWeightGrams = 0;
    let volumetricWeightGrams = 0;

    for (const pkg of packages) {
      actualWeightGrams += pkg.weightGrams * pkg.quantity;
      if (pkg.dimensionsCm) {
        const volKg =
          (pkg.dimensionsCm.lengthCm * pkg.dimensionsCm.widthCm * pkg.dimensionsCm.heightCm) /
          volumetricDivisor;
        const singleVolGrams = Math.ceil(volKg * 1000);
        volumetricWeightGrams += singleVolGrams * pkg.quantity;
      } else {
        volumetricWeightGrams += pkg.weightGrams * pkg.quantity;
      }
    }

    return {
      actualWeightGrams,
      volumetricWeightGrams,
      billableWeightGrams: Math.max(actualWeightGrams, volumetricWeightGrams),
    };
  }

  static quote(
    rawRule: ShippingRateRule,
    rawInput: QuoteShippingInput,
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): ShippingQuoteResult {
    const rule = parseOrThrowLogisticsInput(ShippingRateRuleSchema, rawRule, 'shipping rate rule');
    const input = parseOrThrowLogisticsInput(QuoteShippingInputSchema, rawInput, 'shipping quote input');

    if (!rule.active) {
      throw new ShippingRateError(`Shipping rate rule '${rule.id}' is inactive.`);
    }

    if (rule.currency !== input.currency) {
      throw new ShippingRateError(
        `Rule currency '${rule.currency}' does not match quote currency '${input.currency}'.`
      );
    }

    const weights = this.calculatePackageWeights(input.packages, rule.volumetricDivisor);

    if (
      flags.enableFreeShippingThreshold &&
      rule.freeShippingThresholdCents !== undefined &&
      input.orderSubtotalCents >= rule.freeShippingThresholdCents
    ) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        strategy: rule.strategy,
        amount: Money.zero(rule.currency),
        freeShippingApplied: true,
        ...weights,
      };
    }

    let feeCents = 0;

    switch (rule.strategy) {
      case 'FLAT': {
        feeCents = rule.baseFeeCents;
        break;
      }

      case 'ZONE': {
        if (!flags.enableZoneRates) {
          throw new FeatureDisabledError('enableZoneRates');
        }
        if (!input.zoneCode) {
          throw new ShippingRateError('zoneCode is required for ZONE shipping rate strategy.');
        }
        const entry = rule.zoneRates?.find((z) => z.zoneCode === input.zoneCode);
        if (!entry) {
          throw new ShippingRateError(`No shipping rate configured for zone '${input.zoneCode}'.`);
        }
        feeCents = rule.baseFeeCents + entry.feeCents;
        break;
      }

      case 'DISTANCE': {
        if (!flags.enableDistanceRates) {
          throw new FeatureDisabledError('enableDistanceRates');
        }
        if (input.distanceKm === undefined) {
          throw new ShippingRateError('distanceKm is required for DISTANCE shipping rate strategy.');
        }
        if (rule.perKmCents === undefined) {
          throw new ShippingRateError('perKmCents is required on rule for DISTANCE strategy.');
        }
        const billableKm = Math.max(0, input.distanceKm - rule.includedKm);
        const distanceFeeCents = multiplyCentsHalfEven(rule.perKmCents, billableKm);
        feeCents = rule.baseFeeCents + distanceFeeCents;
        break;
      }

      case 'WEIGHT': {
        if (!flags.enableWeightRates) {
          throw new FeatureDisabledError('enableWeightRates');
        }
        if (!rule.weightTiers || rule.weightTiers.length === 0) {
          throw new ShippingRateError('weightTiers must be configured for WEIGHT strategy.');
        }
        const sortedTiers = [...rule.weightTiers].sort(
          (a, b) => a.maxWeightGrams - b.maxWeightGrams
        );
        const matchedTier = sortedTiers.find(
          (tier) => weights.billableWeightGrams <= tier.maxWeightGrams
        );

        if (matchedTier) {
          feeCents = rule.baseFeeCents + matchedTier.feeCents;
        } else {
          const maxTier = sortedTiers[sortedTiers.length - 1];
          if (rule.extraKgCents === undefined) {
            throw new ShippingRateError(
              `Billable weight (${weights.billableWeightGrams}g) exceeds maximum tier (${maxTier.maxWeightGrams}g).`
            );
          }
          const extraGrams = weights.billableWeightGrams - maxTier.maxWeightGrams;
          const extraKg = Math.ceil(extraGrams / 1000);
          feeCents = rule.baseFeeCents + maxTier.feeCents + extraKg * rule.extraKgCents;
        }
        break;
      }
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      strategy: rule.strategy,
      amount: Money.fromCents(feeCents, rule.currency),
      freeShippingApplied: false,
      ...weights,
    };
  }
}

import { IShippingRateCatalog } from '../contracts/logistics-contracts.js';
import { ShippingRateError } from '../domain/errors/logistics-errors.js';
import {
  ShippingQuoteResult,
  ShippingRateService,
} from '../domain/services/shipping-rate.service.js';
import {
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
  QuoteShippingInput,
} from '../schemas/logistics-schemas.js';

export class QuoteShippingUseCase {
  constructor(
    private readonly rateCatalog: IShippingRateCatalog,
    private readonly flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ) {}

  async execute(ruleId: string, input: QuoteShippingInput): Promise<ShippingQuoteResult> {
    const rule = await this.rateCatalog.findById(ruleId);
    if (!rule) {
      throw new ShippingRateError(`Shipping rate rule '${ruleId}' was not found.`);
    }
    return ShippingRateService.quote(rule, input, this.flags);
  }
}

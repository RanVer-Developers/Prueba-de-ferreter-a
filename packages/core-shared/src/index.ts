export {
  SharedDomainError,
  InvalidMoneyAmountError,
  CurrencyMismatchError,
} from './domain/errors/shared-errors.js';

export {
  CURRENCY_DECIMALS,
  MICRO_SCALE,
  MICRO_SCALE_BIGINT,
  DEFAULT_MONEY_ERROR_HANDLERS,
  currencyDecimals,
  normalizeCurrencyCode,
  divideHalfEven,
  roundHalfEven,
  scaleFactorMicro,
  multiplyCentsHalfEven,
  decimalToCentsHalfEven,
  apportionByWeights,
  Money,
  type MoneyJSON,
  type MoneyErrorHandlers,
} from './domain/value-objects/money.js';

export {
  NonEmptyStringSchema,
  IsoCurrencyCodeSchema,
  IsoDateTimeSchema,
  MoneyJSONSchema,
  createSchemaVersionSchema,
} from './schemas/shared.schemas.js';

export { generateId } from './utils/id-generator.js';

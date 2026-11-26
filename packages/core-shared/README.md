# `@modulos/core-shared`

Primitivas puras compartidas para los módulos `@modulos/core-*`:

- **Aritmética monetaria exacta:** `Money`, `divideHalfEven`, `roundHalfEven`, `multiplyCentsHalfEven`, `decimalToCentsHalfEven`, `apportionByWeights`, `currencyDecimals` (ISO 4217 y `ROUND_HALF_EVEN`).
- **Esquemas Zod base:** `NonEmptyStringSchema`, `IsoCurrencyCodeSchema`, `IsoDateTimeSchema`, `MoneyJSONSchema`, `createSchemaVersionSchema`.
- **Generación segura de IDs:** `generateId(prefix?)` basado en `crypto.randomUUID()`.

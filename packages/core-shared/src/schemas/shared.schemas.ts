import { z } from 'zod';

export const NonEmptyStringSchema = z.string().trim().min(1);

export const IsoCurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Must be a valid 3-letter ISO 4217 currency code.');

export const IsoDateTimeSchema = z.string().datetime({ offset: true }).or(
  z.string().datetime({ local: true })
);

export const MoneyJSONSchema = z.object({
  cents: z.number().int().refine(Number.isSafeInteger, {
    message: 'Minor unit value must be a safe integer.',
  }),
  currency: IsoCurrencyCodeSchema,
});

export function createSchemaVersionSchema(currentVersion: number) {
  return z
    .number()
    .int()
    .positive()
    .refine((v) => v <= currentVersion, {
      message: `Unsupported schemaVersion. Max supported is ${currentVersion}.`,
    });
}

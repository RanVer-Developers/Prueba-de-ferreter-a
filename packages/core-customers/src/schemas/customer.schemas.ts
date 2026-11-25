import { z } from 'zod';
import { InvalidCustomerInputError } from '../domain/errors/customer-errors.js';

export const CUSTOMER_SCHEMA_VERSION = 1 as const;

export const NonEmptyIdSchema = z.string().trim().min(1, 'Identifier cannot be empty.');
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO 4217 code.');

export const EmailSchema = z
  .string()
  .trim()
  .email('Invalid email format.')
  .transform((v) => v.toLowerCase());

export const CustomerTypeSchema = z.enum(['INDIVIDUAL', 'BUSINESS']);
export type CustomerType = z.infer<typeof CustomerTypeSchema>;

export const CustomerStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED', 'ANONYMIZED']);
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;

export const AddressKindSchema = z.enum(['PRIMARY', 'BILLING', 'SHIPPING']);
export type AddressKind = z.infer<typeof AddressKindSchema>;

export const CustomerAddressSchema = z.object({
  id: NonEmptyIdSchema,
  kind: AddressKindSchema.default('PRIMARY'),
  label: z.string().trim().min(1).optional(),
  line1: z.string().trim().min(1, 'Street address line1 is required.'),
  line2: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1, 'City is required.'),
  state: z.string().trim().min(1).optional(),
  postalCode: z.string().trim().min(1, 'Postal code is required.'),
  countryCode: z.string().trim().toUpperCase().length(2).default('MX'),
  isDefault: z.boolean().default(false),
});
export type CustomerAddress = z.infer<typeof CustomerAddressSchema>;

export const CustomerTaxProfileSchema = z.object({
  taxId: z.string().trim().min(1).transform((v) => v.toUpperCase()),
  legalName: z.string().trim().min(1),
  taxRegimeCode: z.string().trim().min(1).optional(),
  taxUseCode: z.string().trim().min(1).optional(),
  fiscalPostalCode: z.string().trim().min(1).optional(),
  fiscalEmail: EmailSchema.optional(),
});
export type CustomerTaxProfile = z.infer<typeof CustomerTaxProfileSchema>;

export const CreditLedgerEntryTypeSchema = z.enum([
  'CHARGE',
  'PAYMENT',
  'ADJUSTMENT_DEBIT',
  'ADJUSTMENT_CREDIT',
  'WRITE_OFF',
]);
export type CreditLedgerEntryType = z.infer<typeof CreditLedgerEntryTypeSchema>;

export const CreditLedgerEntrySchema = z.object({
  id: NonEmptyIdSchema,
  type: CreditLedgerEntryTypeSchema,
  amountCents: z.number().int().positive(),
  balanceAfterCents: z.number().int().min(0),
  referenceId: z.string().trim().min(1).optional(),
  dueAt: z.string().datetime().optional(),
  settledCents: z.number().int().min(0).default(0),
  notes: z.string().trim().min(1).optional(),
  performedBy: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime(),
});
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntrySchema>;

export const WalletEntryTypeSchema = z.enum([
  'DEPOSIT',
  'WITHDRAWAL',
  'REFUND_CREDIT',
  'EXPIRATION',
]);
export type WalletEntryType = z.infer<typeof WalletEntryTypeSchema>;

export const WalletLedgerEntrySchema = z.object({
  id: NonEmptyIdSchema,
  type: WalletEntryTypeSchema,
  amountCents: z.number().int().positive(),
  balanceAfterCents: z.number().int().min(0),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime(),
});
export type WalletLedgerEntry = z.infer<typeof WalletLedgerEntrySchema>;

export const LoyaltyEntryTypeSchema = z.enum(['EARN', 'REDEEM', 'ADJUST', 'EXPIRE']);
export type LoyaltyEntryType = z.infer<typeof LoyaltyEntryTypeSchema>;

export const LoyaltyLotSchema = z.object({
  id: NonEmptyIdSchema,
  earnedPoints: z.number().int().positive(),
  remainingPoints: z.number().int().min(0),
  earnedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  referenceId: z.string().trim().min(1).optional(),
});
export type LoyaltyLot = z.infer<typeof LoyaltyLotSchema>;

export const LoyaltyLedgerEntrySchema = z.object({
  id: NonEmptyIdSchema,
  type: LoyaltyEntryTypeSchema,
  pointsDelta: z.number().int(),
  balanceAfter: z.number().int().min(0),
  discountCents: z.number().int().min(0).optional(),
  referenceId: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  occurredAt: z.string().datetime(),
});
export type LoyaltyLedgerEntry = z.infer<typeof LoyaltyLedgerEntrySchema>;

export const CustomerMetadataSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number().finite(), z.boolean()])
);
export type CustomerMetadata = z.infer<typeof CustomerMetadataSchema>;

export const CustomerSnapshotSchema = z.object({
  schemaVersion: z
    .number()
    .int()
    .min(1)
    .refine((v) => v <= CUSTOMER_SCHEMA_VERSION, {
      error: (iss) =>
        `Unsupported Customer schemaVersion ${String(iss.input)} (max ${CUSTOMER_SCHEMA_VERSION}).`,
    })
    .default(CUSTOMER_SCHEMA_VERSION),
  id: NonEmptyIdSchema,
  code: z.string().trim().min(1).optional(),
  type: CustomerTypeSchema.default('INDIVIDUAL'),
  status: CustomerStatusSchema.default('ACTIVE'),
  displayName: z.string().trim().min(1),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: EmailSchema.optional(),
  phone: z.string().trim().min(1).optional(),
  currency: CurrencyCodeSchema.default('MXN'),
  taxProfile: CustomerTaxProfileSchema.optional(),
  addresses: z.array(CustomerAddressSchema).default([]),
  segments: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  marketingConsent: z.boolean().default(false),
  notes: z.string().trim().min(1).optional(),
  metadata: CustomerMetadataSchema.optional(),
  creditLimitCents: z.number().int().min(0).default(0),
  creditTermDays: z.number().int().min(0).default(0),
  creditBalanceCents: z.number().int().min(0).default(0),
  creditFrozen: z.boolean().default(false),
  creditFreezeReason: z.string().trim().min(1).optional(),
  creditLedger: z.array(CreditLedgerEntrySchema).default([]),
  walletBalanceCents: z.number().int().min(0).default(0),
  walletLedger: z.array(WalletLedgerEntrySchema).default([]),
  loyaltyTierCode: z.string().trim().min(1).default('STANDARD'),
  loyaltyPointsBalance: z.number().int().min(0).default(0),
  loyaltyLifetimePoints: z.number().int().min(0).default(0),
  loyaltyLots: z.array(LoyaltyLotSchema).default([]),
  loyaltyLedger: z.array(LoyaltyLedgerEntrySchema).default([]),
  processedOperationKeys: z.array(z.string().trim().min(1)).default([]),
  version: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  anonymizedAt: z.string().datetime().optional(),
});

export type CustomerSnapshot = z.infer<typeof CustomerSnapshotSchema>;

export function parseWithCustomerSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  context = 'customer input'
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
  const summary = issues.map((i) => `${i.path}: ${i.message}`).join('; ');
  throw new InvalidCustomerInputError(`Invalid ${context}: ${summary}`, issues);
}

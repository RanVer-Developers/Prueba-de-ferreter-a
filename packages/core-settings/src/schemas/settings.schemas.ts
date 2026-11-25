import { z } from 'zod';
import {
  IsoCurrencyCodeSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  createSchemaVersionSchema,
} from '@modulos/core-shared';

export const SETTINGS_SCHEMA_VERSION = 1;
export const SettingsSchemaVersionSchema = createSchemaVersionSchema(SETTINGS_SCHEMA_VERSION);

export const CompanyStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']);
export type CompanyStatus = z.infer<typeof CompanyStatusSchema>;

export const PostalAddressSchema = z.object({
  line1: NonEmptyStringSchema,
  line2: NonEmptyStringSchema.optional(),
  city: NonEmptyStringSchema,
  state: NonEmptyStringSchema.optional(),
  postalCode: NonEmptyStringSchema,
  countryCode: z.string().trim().toUpperCase().length(2).default('MX'),
});
export type PostalAddress = z.infer<typeof PostalAddressSchema>;

export const CompanyProfileSchema = z.object({
  schemaVersion: SettingsSchemaVersionSchema.default(SETTINGS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  code: NonEmptyStringSchema.max(32).transform((v) => v.toUpperCase()),
  legalName: NonEmptyStringSchema,
  tradeName: NonEmptyStringSchema.optional(),
  taxId: NonEmptyStringSchema.transform((v) => v.toUpperCase()),
  taxRegimeCode: NonEmptyStringSchema.optional(),
  fiscalAddress: PostalAddressSchema,
  defaultCurrency: IsoCurrencyCodeSchema.default('MXN'),
  status: CompanyStatusSchema.default('ACTIVE'),
  version: z.number().int().positive().default(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const BranchStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type BranchStatus = z.infer<typeof BranchStatusSchema>;

export const BranchSchema = z.object({
  schemaVersion: SettingsSchemaVersionSchema.default(SETTINGS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  companyId: NonEmptyStringSchema,
  code: NonEmptyStringSchema.max(32).transform((v) => v.toUpperCase()),
  name: NonEmptyStringSchema,
  isHeadquarters: z.boolean().default(false),
  postalCode: NonEmptyStringSchema,
  address: PostalAddressSchema.optional(),
  timezone: NonEmptyStringSchema.default('America/Mexico_City'),
  defaultWarehouseId: NonEmptyStringSchema.optional(),
  defaultCashRegisterId: NonEmptyStringSchema.optional(),
  defaultBillingSeriesId: NonEmptyStringSchema.optional(),
  status: BranchStatusSchema.default('ACTIVE'),
  version: z.number().int().positive().default(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Branch = z.infer<typeof BranchSchema>;

export const FiscalPeriodStatusSchema = z.enum(['OPEN', 'SOFT_LOCKED', 'CLOSED']);
export type FiscalPeriodStatus = z.infer<typeof FiscalPeriodStatusSchema>;

export const FiscalPeriodSchema = z
  .object({
    schemaVersion: SettingsSchemaVersionSchema.default(SETTINGS_SCHEMA_VERSION),
    id: NonEmptyStringSchema,
    companyId: NonEmptyStringSchema,
    fiscalYear: z.number().int().min(2000).max(2100),
    /** 1..12 for monthly periods, or 0 for full annual historical period. */
    periodNumber: z.number().int().min(0).max(12),
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    status: FiscalPeriodStatusSchema.default('OPEN'),
    closedBy: NonEmptyStringSchema.optional(),
    closedAt: IsoDateTimeSchema.optional(),
    notes: z.string().trim().max(500).optional(),
    version: z.number().int().positive().default(1),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .refine((p) => Date.parse(p.startsAt) <= Date.parse(p.endsAt), {
    message: 'startsAt must be less than or equal to endsAt.',
  });
export type FiscalPeriod = z.infer<typeof FiscalPeriodSchema>;

export const SettingScopeTypeSchema = z.enum(['GLOBAL', 'COMPANY', 'BRANCH', 'TERMINAL']);
export type SettingScopeType = z.infer<typeof SettingScopeTypeSchema>;

export const SettingValueTypeSchema = z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']);
export type SettingValueType = z.infer<typeof SettingValueTypeSchema>;

export const SettingKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*$/i, {
    message: 'Setting key must follow namespace.key format.',
  });

export const SettingValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);
export type SettingValue = z.infer<typeof SettingValueSchema>;

export const SettingEntrySchema = z
  .object({
    schemaVersion: SettingsSchemaVersionSchema.default(SETTINGS_SCHEMA_VERSION),
    id: NonEmptyStringSchema,
    scopeType: SettingScopeTypeSchema,
    scopeId: NonEmptyStringSchema.optional(),
    key: SettingKeySchema,
    valueType: SettingValueTypeSchema,
    value: SettingValueSchema,
    description: z.string().trim().max(300).optional(),
    updatedBy: NonEmptyStringSchema.optional(),
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((entry, ctx) => {
    if (entry.scopeType !== 'GLOBAL' && !entry.scopeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['scopeId'],
        message: 'scopeId is required when scopeType is not GLOBAL.',
      });
    }
    if (entry.scopeType === 'GLOBAL' && entry.scopeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['scopeId'],
        message: 'scopeId must be omitted for GLOBAL scope.',
      });
    }
  });
export type SettingEntry = z.infer<typeof SettingEntrySchema>;

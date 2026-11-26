import { generateId, IsoCurrencyCodeSchema, NonEmptyStringSchema } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemSettingsClock,
  type ISettingsClock,
  type ISettingsEventBus,
} from '../contracts/settings-contracts.js';
import {
  CompanyNotFoundError,
  DuplicateCompanyCodeError,
  InvalidSettingsInputError,
} from '../domain/errors/settings-errors.js';
import {
  assertSettingsFeatureEnabled,
  resolveSettingsFeatures,
  type SettingsFeatureProfile,
} from '../domain/services/settings-features.js';
import type { ICompanyRepository } from '../repositories/settings-repositories.interface.js';
import {
  CompanyProfileSchema,
  CompanyStatusSchema,
  PostalAddressSchema,
  SETTINGS_SCHEMA_VERSION,
  type CompanyProfile,
} from '../schemas/settings.schemas.js';

export const CreateCompanyInputSchema = z.object({
  id: NonEmptyStringSchema.optional(),
  code: NonEmptyStringSchema.max(32),
  legalName: NonEmptyStringSchema,
  tradeName: NonEmptyStringSchema.optional(),
  taxId: NonEmptyStringSchema,
  taxRegimeCode: NonEmptyStringSchema.optional(),
  fiscalAddress: PostalAddressSchema,
  defaultCurrency: IsoCurrencyCodeSchema.default('MXN'),
});
export type CreateCompanyInput = z.input<typeof CreateCompanyInputSchema>;

export const UpdateCompanyInputSchema = z.object({
  companyId: NonEmptyStringSchema,
  legalName: NonEmptyStringSchema.optional(),
  tradeName: NonEmptyStringSchema.optional(),
  taxId: NonEmptyStringSchema.optional(),
  taxRegimeCode: NonEmptyStringSchema.optional(),
  fiscalAddress: PostalAddressSchema.optional(),
  defaultCurrency: IsoCurrencyCodeSchema.optional(),
  status: CompanyStatusSchema.optional(),
});
export type UpdateCompanyInput = z.input<typeof UpdateCompanyInputSchema>;

export interface ManageCompanyDeps {
  companyRepository: ICompanyRepository;
  eventBus?: ISettingsEventBus;
  clock?: ISettingsClock;
  featureProfile?: SettingsFeatureProfile;
}

function parseInput<T>(schema: z.ZodType<T>, raw: unknown, context: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new InvalidSettingsInputError(`Invalid ${context}: ${detail}`);
  }
  return parsed.data;
}

export async function createCompany(
  rawInput: CreateCompanyInput,
  deps: ManageCompanyDeps,
): Promise<CompanyProfile> {
  const features = resolveSettingsFeatures(deps.featureProfile);
  const existingCompanies = await deps.companyRepository.findAll();
  if (existingCompanies.length > 0) {
    assertSettingsFeatureEnabled(features, 'multiCompany');
  }
  const data = parseInput(CreateCompanyInputSchema, rawInput, 'create company input');
  const normalizedCode = data.code.trim().toUpperCase();

  const existingByCode = await deps.companyRepository.findByCode(normalizedCode);
  if (existingByCode) {
    throw new DuplicateCompanyCodeError(normalizedCode);
  }

  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();
  const company = CompanyProfileSchema.parse({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    id: data.id ?? generateId('comp'),
    code: normalizedCode,
    legalName: data.legalName,
    tradeName: data.tradeName,
    taxId: data.taxId,
    taxRegimeCode: data.taxRegimeCode,
    fiscalAddress: data.fiscalAddress,
    defaultCurrency: data.defaultCurrency,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await deps.companyRepository.save(company);
  await deps.eventBus?.publish({
    type: 'CompanyCreated',
    companyId: company.id,
    code: company.code,
    occurredAt: now,
  });

  return company;
}

export async function updateCompany(
  rawInput: UpdateCompanyInput,
  deps: ManageCompanyDeps,
): Promise<CompanyProfile> {
  const data = parseInput(UpdateCompanyInputSchema, rawInput, 'update company input');
  const existing = await deps.companyRepository.findById(data.companyId);
  if (!existing) {
    throw new CompanyNotFoundError(data.companyId);
  }

  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();
  const updated = CompanyProfileSchema.parse({
    ...existing,
    legalName: data.legalName ?? existing.legalName,
    tradeName: data.tradeName ?? existing.tradeName,
    taxId: data.taxId ?? existing.taxId,
    taxRegimeCode: data.taxRegimeCode ?? existing.taxRegimeCode,
    fiscalAddress: data.fiscalAddress ?? existing.fiscalAddress,
    defaultCurrency: data.defaultCurrency ?? existing.defaultCurrency,
    status: data.status ?? existing.status,
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.companyRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'CompanyUpdated',
    companyId: updated.id,
    status: updated.status,
    occurredAt: now,
  });

  return updated;
}

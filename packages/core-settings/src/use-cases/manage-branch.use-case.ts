import { generateId, NonEmptyStringSchema } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemSettingsClock,
  type ISettingsClock,
  type ISettingsEventBus,
} from '../contracts/settings-contracts.js';
import {
  BranchNotFoundError,
  CompanyNotFoundError,
  DuplicateBranchCodeError,
  InvalidBranchStateError,
  InvalidSettingsInputError,
} from '../domain/errors/settings-errors.js';
import {
  assertSettingsFeatureEnabled,
  resolveSettingsFeatures,
  type SettingsFeatureProfile,
} from '../domain/services/settings-features.js';
import type {
  IBranchRepository,
  ICompanyRepository,
} from '../repositories/settings-repositories.interface.js';
import {
  BranchSchema,
  BranchStatusSchema,
  PostalAddressSchema,
  SETTINGS_SCHEMA_VERSION,
  type Branch,
} from '../schemas/settings.schemas.js';

export const CreateBranchInputSchema = z.object({
  id: NonEmptyStringSchema.optional(),
  companyId: NonEmptyStringSchema,
  code: NonEmptyStringSchema.max(32),
  name: NonEmptyStringSchema,
  isHeadquarters: z.boolean().default(false),
  postalCode: NonEmptyStringSchema,
  address: PostalAddressSchema.optional(),
  timezone: NonEmptyStringSchema.default('America/Mexico_City'),
  defaultWarehouseId: NonEmptyStringSchema.optional(),
  defaultCashRegisterId: NonEmptyStringSchema.optional(),
  defaultBillingSeriesId: NonEmptyStringSchema.optional(),
});
export type CreateBranchInput = z.input<typeof CreateBranchInputSchema>;

export const UpdateBranchInputSchema = z.object({
  branchId: NonEmptyStringSchema,
  name: NonEmptyStringSchema.optional(),
  isHeadquarters: z.boolean().optional(),
  postalCode: NonEmptyStringSchema.optional(),
  address: PostalAddressSchema.optional(),
  timezone: NonEmptyStringSchema.optional(),
  defaultWarehouseId: NonEmptyStringSchema.optional(),
  defaultCashRegisterId: NonEmptyStringSchema.optional(),
  defaultBillingSeriesId: NonEmptyStringSchema.optional(),
  status: BranchStatusSchema.optional(),
});
export type UpdateBranchInput = z.input<typeof UpdateBranchInputSchema>;

export interface ManageBranchDeps {
  branchRepository: IBranchRepository;
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

export async function createBranch(
  rawInput: CreateBranchInput,
  deps: ManageBranchDeps,
): Promise<Branch> {
  const features = resolveSettingsFeatures(deps.featureProfile);
  const data = parseInput(CreateBranchInputSchema, rawInput, 'create branch input');
  const existingForCompany = await deps.branchRepository.findAll({ companyId: data.companyId });
  if (existingForCompany.length > 0) {
    assertSettingsFeatureEnabled(features, 'multiBranch');
  }
  const company = await deps.companyRepository.findById(data.companyId);
  if (!company) {
    throw new CompanyNotFoundError(data.companyId);
  }
  if (company.status !== 'ACTIVE') {
    throw new InvalidBranchStateError(
      `Cannot create branch under company '${company.id}' in status '${company.status}'.`,
    );
  }

  const normalizedCode = data.code.trim().toUpperCase();
  const duplicate = await deps.branchRepository.findByCode(data.companyId, normalizedCode);
  if (duplicate) {
    throw new DuplicateBranchCodeError(data.companyId, normalizedCode);
  }

  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();

  if (data.isHeadquarters) {
    const existingBranches = await deps.branchRepository.findAll({ companyId: data.companyId });
    for (const b of existingBranches) {
      if (b.isHeadquarters) {
        const demoted = BranchSchema.parse({
          ...b,
          isHeadquarters: false,
          version: b.version + 1,
          updatedAt: now,
        });
        await deps.branchRepository.save(demoted, b.version);
      }
    }
  }

  const branch = BranchSchema.parse({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    id: data.id ?? generateId('br'),
    companyId: data.companyId,
    code: normalizedCode,
    name: data.name,
    isHeadquarters: data.isHeadquarters,
    postalCode: data.postalCode,
    address: data.address,
    timezone: data.timezone,
    defaultWarehouseId: data.defaultWarehouseId,
    defaultCashRegisterId: data.defaultCashRegisterId,
    defaultBillingSeriesId: data.defaultBillingSeriesId,
    status: 'ACTIVE',
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await deps.branchRepository.save(branch);
  await deps.eventBus?.publish({
    type: 'BranchCreated',
    branchId: branch.id,
    companyId: branch.companyId,
    code: branch.code,
    occurredAt: now,
  });

  return branch;
}

export async function updateBranch(
  rawInput: UpdateBranchInput,
  deps: ManageBranchDeps,
): Promise<Branch> {
  const data = parseInput(UpdateBranchInputSchema, rawInput, 'update branch input');
  const existing = await deps.branchRepository.findById(data.branchId);
  if (!existing) {
    throw new BranchNotFoundError(data.branchId);
  }

  const nextStatus = data.status ?? existing.status;
  const nextHq = data.isHeadquarters ?? existing.isHeadquarters;

  if (nextStatus === 'INACTIVE') {
    const siblings = await deps.branchRepository.findAll({
      companyId: existing.companyId,
      status: 'ACTIVE',
    });
    const otherActive = siblings.some((b) => b.id !== existing.id);
    if (!otherActive) {
      throw new InvalidBranchStateError(
        `Cannot deactivate the last active branch '${existing.id}' of company '${existing.companyId}'.`,
      );
    }
    if (nextHq) {
      throw new InvalidBranchStateError('Headquarters branch cannot be inactive.');
    }
  }

  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();

  if (data.isHeadquarters === true && !existing.isHeadquarters) {
    const existingBranches = await deps.branchRepository.findAll({ companyId: existing.companyId });
    for (const b of existingBranches) {
      if (b.id !== existing.id && b.isHeadquarters) {
        const demoted = BranchSchema.parse({
          ...b,
          isHeadquarters: false,
          version: b.version + 1,
          updatedAt: now,
        });
        await deps.branchRepository.save(demoted, b.version);
      }
    }
  }

  const updated = BranchSchema.parse({
    ...existing,
    name: data.name ?? existing.name,
    isHeadquarters: nextHq,
    postalCode: data.postalCode ?? existing.postalCode,
    address: data.address ?? existing.address,
    timezone: data.timezone ?? existing.timezone,
    defaultWarehouseId: data.defaultWarehouseId ?? existing.defaultWarehouseId,
    defaultCashRegisterId: data.defaultCashRegisterId ?? existing.defaultCashRegisterId,
    defaultBillingSeriesId: data.defaultBillingSeriesId ?? existing.defaultBillingSeriesId,
    status: nextStatus,
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.branchRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'BranchUpdated',
    branchId: updated.id,
    companyId: updated.companyId,
    status: updated.status,
    occurredAt: now,
  });

  return updated;
}

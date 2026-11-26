import { generateId, IsoDateTimeSchema, NonEmptyStringSchema } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemSettingsClock,
  type ISettingsClock,
  type ISettingsEventBus,
} from '../contracts/settings-contracts.js';
import {
  CompanyNotFoundError,
  FiscalPeriodClosedError,
  FiscalPeriodNotFoundError,
  InvalidFiscalPeriodStateError,
  InvalidSettingsInputError,
} from '../domain/errors/settings-errors.js';
import {
  assertSettingsFeatureEnabled,
  resolveSettingsFeatures,
  type SettingsFeatureProfile,
} from '../domain/services/settings-features.js';
import type {
  ICompanyRepository,
  IFiscalPeriodRepository,
} from '../repositories/settings-repositories.interface.js';
import {
  FiscalPeriodSchema,
  FiscalPeriodStatusSchema,
  SETTINGS_SCHEMA_VERSION,
  type FiscalPeriod,
  type FiscalPeriodStatus,
} from '../schemas/settings.schemas.js';

export const CreateFiscalPeriodInputSchema = z.object({
  id: NonEmptyStringSchema.optional(),
  companyId: NonEmptyStringSchema,
  fiscalYear: z.number().int().min(2000).max(2100),
  periodNumber: z.number().int().min(0).max(12),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  notes: z.string().trim().max(500).optional(),
});
export type CreateFiscalPeriodInput = z.input<typeof CreateFiscalPeriodInputSchema>;

export const ChangeFiscalPeriodStatusInputSchema = z.object({
  periodId: NonEmptyStringSchema,
  targetStatus: FiscalPeriodStatusSchema,
  changedBy: NonEmptyStringSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});
export type ChangeFiscalPeriodStatusInput = z.input<typeof ChangeFiscalPeriodStatusInputSchema>;

export const AssertOpenPeriodInputSchema = z.object({
  companyId: NonEmptyStringSchema,
  operationDate: IsoDateTimeSchema,
  allowSoftLocked: z.boolean().default(false),
});
export type AssertOpenPeriodInput = z.input<typeof AssertOpenPeriodInputSchema>;

export interface ManageFiscalPeriodDeps {
  fiscalPeriodRepository: IFiscalPeriodRepository;
  companyRepository?: ICompanyRepository;
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

const VALID_PERIOD_TRANSITIONS: Readonly<Record<FiscalPeriodStatus, ReadonlyArray<FiscalPeriodStatus>>> = {
  OPEN: ['SOFT_LOCKED', 'CLOSED'],
  SOFT_LOCKED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};

export async function createFiscalPeriod(
  rawInput: CreateFiscalPeriodInput,
  deps: ManageFiscalPeriodDeps,
): Promise<FiscalPeriod> {
  const features = resolveSettingsFeatures(deps.featureProfile);
  assertSettingsFeatureEnabled(features, 'fiscalPeriods');
  const data = parseInput(CreateFiscalPeriodInputSchema, rawInput, 'create fiscal period input');
  if (deps.companyRepository) {
    const company = await deps.companyRepository.findById(data.companyId);
    if (!company) throw new CompanyNotFoundError(data.companyId);
  }

  const existing = await deps.fiscalPeriodRepository.findByCompany({
    companyId: data.companyId,
    fiscalYear: data.fiscalYear,
  });
  if (existing.some((p) => p.periodNumber === data.periodNumber)) {
    throw new InvalidFiscalPeriodStateError(
      `Fiscal period ${data.fiscalYear}-${data.periodNumber} already exists for company '${data.companyId}'.`,
    );
  }

  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();
  const period = FiscalPeriodSchema.parse({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    id: data.id ?? generateId('fper'),
    companyId: data.companyId,
    fiscalYear: data.fiscalYear,
    periodNumber: data.periodNumber,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    status: 'OPEN',
    notes: data.notes,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  await deps.fiscalPeriodRepository.save(period);
  await deps.eventBus?.publish({
    type: 'FiscalPeriodCreated',
    periodId: period.id,
    companyId: period.companyId,
    fiscalYear: period.fiscalYear,
    periodNumber: period.periodNumber,
    occurredAt: now,
  });

  return period;
}

export async function changeFiscalPeriodStatus(
  rawInput: ChangeFiscalPeriodStatusInput,
  deps: ManageFiscalPeriodDeps,
): Promise<FiscalPeriod> {
  const features = resolveSettingsFeatures(deps.featureProfile);
  assertSettingsFeatureEnabled(features, 'fiscalPeriods');
  const data = parseInput(
    ChangeFiscalPeriodStatusInputSchema,
    rawInput,
    'change fiscal period status input',
  );
  if (data.targetStatus === 'SOFT_LOCKED') {
    assertSettingsFeatureEnabled(features, 'softLockPeriods');
  }
  const existing = await deps.fiscalPeriodRepository.findById(data.periodId);
  if (!existing) {
    throw new FiscalPeriodNotFoundError(data.periodId);
  }

  if (existing.status === data.targetStatus) {
    return existing;
  }

  const allowed = VALID_PERIOD_TRANSITIONS[existing.status];
  if (!allowed.includes(data.targetStatus)) {
    throw new InvalidFiscalPeriodStateError(
      `Cannot transition fiscal period '${existing.id}' from '${existing.status}' to '${data.targetStatus}'.`,
    );
  }

  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();
  const updated = FiscalPeriodSchema.parse({
    ...existing,
    status: data.targetStatus,
    closedBy: data.targetStatus === 'CLOSED' ? data.changedBy : existing.closedBy,
    closedAt: data.targetStatus === 'CLOSED' ? now : existing.closedAt,
    notes: data.notes ?? existing.notes,
    version: existing.version + 1,
    updatedAt: now,
  });

  await deps.fiscalPeriodRepository.save(updated, existing.version);
  await deps.eventBus?.publish({
    type: 'FiscalPeriodStatusChanged',
    periodId: updated.id,
    companyId: updated.companyId,
    previousStatus: existing.status,
    newStatus: updated.status,
    changedBy: data.changedBy,
    occurredAt: now,
  });

  return updated;
}

export async function assertDateInOpenFiscalPeriod(
  rawInput: AssertOpenPeriodInput,
  deps: Pick<ManageFiscalPeriodDeps, 'fiscalPeriodRepository'>,
): Promise<FiscalPeriod> {
  const data = parseInput(AssertOpenPeriodInputSchema, rawInput, 'assert open fiscal period input');
  const targetMs = Date.parse(data.operationDate);
  const periods = await deps.fiscalPeriodRepository.findByCompany({ companyId: data.companyId });

  const matching = periods.filter(
    (p) => Date.parse(p.startsAt) <= targetMs && targetMs <= Date.parse(p.endsAt),
  );
  if (matching.length === 0) {
    throw new FiscalPeriodClosedError(data.operationDate);
  }

  // Prefer most specific period (monthly periodNumber > 0 over annual periodNumber === 0)
  const prioritized = [...matching].sort((a, b) => b.periodNumber - a.periodNumber);
  const closedMatch = prioritized.find(
    (p) => p.status === 'CLOSED' || (!data.allowSoftLocked && p.status === 'SOFT_LOCKED'),
  );
  if (closedMatch) {
    throw new FiscalPeriodClosedError(data.operationDate, closedMatch.id);
  }

  return prioritized[0]!;
}

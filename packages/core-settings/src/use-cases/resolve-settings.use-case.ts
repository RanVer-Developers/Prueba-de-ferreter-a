import { generateId, NonEmptyStringSchema } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemSettingsClock,
  type ISettingsClock,
  type ISettingsEventBus,
} from '../contracts/settings-contracts.js';
import {
  InvalidSettingsInputError,
  SettingTypeMismatchError,
} from '../domain/errors/settings-errors.js';
import {
  assertSettingsFeatureEnabled,
  resolveSettingsFeatures,
  type SettingsFeatureProfile,
} from '../domain/services/settings-features.js';
import type { ISettingRepository } from '../repositories/settings-repositories.interface.js';
import {
  SETTINGS_SCHEMA_VERSION,
  SettingEntrySchema,
  SettingKeySchema,
  SettingScopeTypeSchema,
  SettingValueSchema,
  SettingValueTypeSchema,
  type SettingEntry,
  type SettingScopeType,
  type SettingValue,
  type SettingValueType,
} from '../schemas/settings.schemas.js';

export const SetSettingInputSchema = z.object({
  scopeType: SettingScopeTypeSchema,
  scopeId: NonEmptyStringSchema.optional(),
  key: SettingKeySchema,
  valueType: SettingValueTypeSchema,
  value: SettingValueSchema,
  description: z.string().trim().max(300).optional(),
  updatedBy: NonEmptyStringSchema.optional(),
});
export type SetSettingInput = z.input<typeof SetSettingInputSchema>;

export const ResolveSettingInputSchema = z.object({
  key: SettingKeySchema,
  companyId: NonEmptyStringSchema.optional(),
  branchId: NonEmptyStringSchema.optional(),
  terminalId: NonEmptyStringSchema.optional(),
});
export type ResolveSettingInput = z.input<typeof ResolveSettingInputSchema>;

export const ResolveEffectiveSettingsInputSchema = z.object({
  companyId: NonEmptyStringSchema.optional(),
  branchId: NonEmptyStringSchema.optional(),
  terminalId: NonEmptyStringSchema.optional(),
  keyPrefix: NonEmptyStringSchema.optional(),
});
export type ResolveEffectiveSettingsInput = z.input<typeof ResolveEffectiveSettingsInputSchema>;

export interface ResolvedSettingResult {
  readonly key: string;
  readonly value: SettingValue;
  readonly valueType: SettingValueType;
  readonly resolvedFromScope: SettingScopeType;
  readonly resolvedFromScopeId?: string;
}

export interface ManageSettingDeps {
  settingRepository: ISettingRepository;
  eventBus?: ISettingsEventBus;
  clock?: ISettingsClock;
  featureProfile?: SettingsFeatureProfile;
}

function assertValueMatchesType(key: string, valueType: SettingValueType, value: SettingValue): void {
  if (valueType === 'STRING' && typeof value !== 'string') {
    throw new SettingTypeMismatchError(key, 'STRING');
  }
  if (valueType === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new SettingTypeMismatchError(key, 'NUMBER');
  }
  if (valueType === 'BOOLEAN' && typeof value !== 'boolean') {
    throw new SettingTypeMismatchError(key, 'BOOLEAN');
  }
  if (valueType === 'JSON' && (typeof value !== 'object' || value === null)) {
    throw new SettingTypeMismatchError(key, 'JSON');
  }
}

export async function setSetting(
  rawInput: SetSettingInput,
  deps: ManageSettingDeps,
): Promise<SettingEntry> {
  const features = resolveSettingsFeatures(deps.featureProfile);
  const parsed = SetSettingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new InvalidSettingsInputError(`Invalid set setting input: ${detail}`);
  }
  const data = parsed.data;
  if (data.scopeType === 'TERMINAL') {
    assertSettingsFeatureEnabled(features, 'terminalScopedSettings');
  }
  assertValueMatchesType(data.key, data.valueType, data.value);

  const normalizedKey = data.key.toLowerCase();
  const previous = await deps.settingRepository.findOne(data.scopeType, data.scopeId, normalizedKey);
  const now = (deps.clock ?? new SystemSettingsClock()).now().toISOString();

  const entry = SettingEntrySchema.parse({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    id: previous?.id ?? generateId('set'),
    scopeType: data.scopeType,
    scopeId: data.scopeId,
    key: normalizedKey,
    valueType: data.valueType,
    value: data.value,
    description: data.description ?? previous?.description,
    updatedBy: data.updatedBy,
    updatedAt: now,
  });

  await deps.settingRepository.save(entry);
  await deps.eventBus?.publish({
    type: 'SettingChanged',
    key: entry.key,
    scopeType: entry.scopeType,
    scopeId: entry.scopeId,
    previousValue: previous?.value,
    newValue: entry.value,
    updatedBy: data.updatedBy,
    occurredAt: now,
  });

  return entry;
}

export async function resolveSetting(
  rawInput: ResolveSettingInput,
  deps: Pick<ManageSettingDeps, 'settingRepository'>,
): Promise<ResolvedSettingResult | null> {
  const parsed = ResolveSettingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new InvalidSettingsInputError(`Invalid resolve setting input: ${detail}`);
  }
  const { key, companyId, branchId, terminalId } = parsed.data;
  const normalizedKey = key.toLowerCase();

  const candidates: Array<{ scopeType: SettingScopeType; scopeId?: string }> = [];
  if (terminalId) candidates.push({ scopeType: 'TERMINAL', scopeId: terminalId });
  if (branchId) candidates.push({ scopeType: 'BRANCH', scopeId: branchId });
  if (companyId) candidates.push({ scopeType: 'COMPANY', scopeId: companyId });
  candidates.push({ scopeType: 'GLOBAL', scopeId: undefined });

  for (const candidate of candidates) {
    const found = await deps.settingRepository.findOne(
      candidate.scopeType,
      candidate.scopeId,
      normalizedKey,
    );
    if (found) {
      return {
        key: found.key,
        value: found.value,
        valueType: found.valueType,
        resolvedFromScope: found.scopeType,
        resolvedFromScopeId: found.scopeId,
      };
    }
  }

  return null;
}

export async function resolveEffectiveSettings(
  rawInput: ResolveEffectiveSettingsInput,
  deps: Pick<ManageSettingDeps, 'settingRepository'>,
): Promise<Record<string, ResolvedSettingResult>> {
  const parsed = ResolveEffectiveSettingsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidSettingsInputError('Invalid resolve effective settings input.');
  }
  const { companyId, branchId, terminalId, keyPrefix } = parsed.data;

  const entries = await deps.settingRepository.findAll({ keyPrefix });
  const priority: Record<SettingScopeType, number> = {
    GLOBAL: 1,
    COMPANY: 2,
    BRANCH: 3,
    TERMINAL: 4,
  };

  const resolved: Record<string, { rank: number; result: ResolvedSettingResult }> = {};

  for (const entry of entries) {
    const matchesScope =
      entry.scopeType === 'GLOBAL' ||
      (entry.scopeType === 'COMPANY' && entry.scopeId === companyId) ||
      (entry.scopeType === 'BRANCH' && entry.scopeId === branchId) ||
      (entry.scopeType === 'TERMINAL' && entry.scopeId === terminalId);

    if (!matchesScope) continue;

    const rank = priority[entry.scopeType];
    const current = resolved[entry.key];
    if (!current || rank > current.rank) {
      resolved[entry.key] = {
        rank,
        result: {
          key: entry.key,
          value: entry.value,
          valueType: entry.valueType,
          resolvedFromScope: entry.scopeType,
          resolvedFromScopeId: entry.scopeId,
        },
      };
    }
  }

  const output: Record<string, ResolvedSettingResult> = {};
  for (const [k, v] of Object.entries(resolved)) {
    output[k] = v.result;
  }
  return output;
}

import {
  ISettingsClock,
  ISettingsEventBus,
  SystemSettingsClock,
} from './contracts/settings-contracts.js';
import {
  SettingsFeatureFlags,
  SettingsFeatureProfile,
  resolveSettingsFeatures,
} from './domain/services/settings-features.js';
import {
  InMemoryBranchRepository,
  InMemoryCompanyRepository,
  InMemoryFiscalPeriodRepository,
  InMemorySettingRepository,
} from './repositories/in-memory/in-memory-settings-repositories.js';
import type {
  IBranchRepository,
  ICompanyRepository,
  IFiscalPeriodRepository,
  ISettingRepository,
} from './repositories/settings-repositories.interface.js';
import {
  type CreateBranchInput,
  type UpdateBranchInput,
  createBranch,
  updateBranch,
} from './use-cases/manage-branch.use-case.js';
import {
  type CreateCompanyInput,
  type UpdateCompanyInput,
  createCompany,
  updateCompany,
} from './use-cases/manage-company.use-case.js';
import {
  type AssertOpenPeriodInput,
  type ChangeFiscalPeriodStatusInput,
  type CreateFiscalPeriodInput,
  assertDateInOpenFiscalPeriod,
  changeFiscalPeriodStatus,
  createFiscalPeriod,
} from './use-cases/manage-fiscal-periods.use-case.js';
import {
  type ResolveEffectiveSettingsInput,
  type ResolveSettingInput,
  type SetSettingInput,
  resolveEffectiveSettings,
  resolveSetting,
  setSetting,
} from './use-cases/resolve-settings.use-case.js';

export interface SettingsModuleDeps {
  companyRepository?: ICompanyRepository;
  branchRepository?: IBranchRepository;
  fiscalPeriodRepository?: IFiscalPeriodRepository;
  settingRepository?: ISettingRepository;
  eventBus?: ISettingsEventBus;
  clock?: ISettingsClock;
  featureProfile?: SettingsFeatureProfile;
}

export function createSettingsModule(deps: SettingsModuleDeps = {}) {
  const companyRepository = deps.companyRepository ?? new InMemoryCompanyRepository();
  const branchRepository = deps.branchRepository ?? new InMemoryBranchRepository();
  const fiscalPeriodRepository =
    deps.fiscalPeriodRepository ?? new InMemoryFiscalPeriodRepository();
  const settingRepository = deps.settingRepository ?? new InMemorySettingRepository();
  const clock = deps.clock ?? new SystemSettingsClock();
  const features: SettingsFeatureFlags = resolveSettingsFeatures(deps.featureProfile);

  return {
    features,
    repositories: {
      companyRepository,
      branchRepository,
      fiscalPeriodRepository,
      settingRepository,
    },
    createCompany: (input: CreateCompanyInput) =>
      createCompany(input, {
        companyRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    updateCompany: (input: UpdateCompanyInput) =>
      updateCompany(input, {
        companyRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    createBranch: (input: CreateBranchInput) =>
      createBranch(input, {
        companyRepository,
        branchRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    updateBranch: (input: UpdateBranchInput) =>
      updateBranch(input, {
        companyRepository,
        branchRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    createFiscalPeriod: (input: CreateFiscalPeriodInput) =>
      createFiscalPeriod(input, {
        fiscalPeriodRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    changeFiscalPeriodStatus: (input: ChangeFiscalPeriodStatusInput) =>
      changeFiscalPeriodStatus(input, {
        fiscalPeriodRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    assertDateInOpenFiscalPeriod: (input: AssertOpenPeriodInput) =>
      assertDateInOpenFiscalPeriod(input, { fiscalPeriodRepository }),
    setSetting: (input: SetSettingInput) =>
      setSetting(input, {
        settingRepository,
        eventBus: deps.eventBus,
        clock,
        featureProfile: features,
      }),
    resolveSetting: (input: ResolveSettingInput) =>
      resolveSetting(input, { settingRepository }),
    resolveEffectiveSettings: (input: ResolveEffectiveSettingsInput) =>
      resolveEffectiveSettings(input, { settingRepository }),
  };
}

export type SettingsModule = ReturnType<typeof createSettingsModule>;

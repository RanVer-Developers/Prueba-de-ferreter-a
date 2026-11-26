import { describe, expect, it } from 'vitest';
import {
  InMemoryBranchRepository,
  InMemoryCompanyRepository,
  InMemoryFiscalPeriodRepository,
  InMemorySettingRepository,
  SETTINGS_TIER_PRESETS,
  SettingsFeatureDisabledError,
  createBranch,
  createCompany,
  createFiscalPeriod,
  resolveSettingsFeatures,
  setSetting,
} from '../src/index.js';

describe('@modulos/core-settings feature tiers', () => {
  it('enforces BASIC, INTERMEDIATE, and ADVANCED feature flags', async () => {
    expect(resolveSettingsFeatures('BASIC')).toEqual(SETTINGS_TIER_PRESETS.BASIC);
    expect(resolveSettingsFeatures('INTERMEDIATE').multiBranch).toBe(true);
    expect(resolveSettingsFeatures('INTERMEDIATE').multiCompany).toBe(false);

    const companyRepo = new InMemoryCompanyRepository();
    const branchRepo = new InMemoryBranchRepository();
    const periodRepo = new InMemoryFiscalPeriodRepository();
    const settingRepo = new InMemorySettingRepository();

    await createCompany(
      {
        id: 'c1',
        code: 'C1',
        legalName: 'Empresa 1',
        taxId: 'MGB850101AB8',
        fiscalAddress: { line1: 'Calle 1', city: 'GDL', postalCode: '44100' },
      },
      { companyRepository: companyRepo, featureProfile: 'BASIC' },
    );

    await expect(
      createCompany(
        {
          id: 'c2',
          code: 'C2',
          legalName: 'Empresa 2',
          taxId: 'CLI900101XY9',
          fiscalAddress: { line1: 'Calle 2', city: 'GDL', postalCode: '44100' },
        },
        { companyRepository: companyRepo, featureProfile: 'BASIC' },
      ),
    ).rejects.toThrow(SettingsFeatureDisabledError);

    await createBranch(
      { id: 'b1', companyId: 'c1', code: 'M', name: 'Matriz', postalCode: '44100' },
      { branchRepository: branchRepo, companyRepository: companyRepo, featureProfile: 'BASIC' },
    );
    await expect(
      createBranch(
        { id: 'b2', companyId: 'c1', code: 'S2', name: 'Suc 2', postalCode: '44100' },
        { branchRepository: branchRepo, companyRepository: companyRepo, featureProfile: 'BASIC' },
      ),
    ).rejects.toThrow(SettingsFeatureDisabledError);

    await expect(
      createFiscalPeriod(
        {
          companyId: 'c1',
          fiscalYear: 2026,
          periodNumber: 1,
          startsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2026-01-31T23:59:59.999Z',
        },
        { fiscalPeriodRepository: periodRepo, featureProfile: 'BASIC' },
      ),
    ).rejects.toThrow(SettingsFeatureDisabledError);

    await expect(
      setSetting(
        {
          scopeType: 'TERMINAL',
          scopeId: 'pos-1',
          key: 'pos.print_copy',
          valueType: 'BOOLEAN',
          value: true,
        },
        { settingRepository: settingRepo, featureProfile: 'INTERMEDIATE' },
      ),
    ).rejects.toThrow(SettingsFeatureDisabledError);
  });
});

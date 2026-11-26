import { describe, expect, it } from 'vitest';
import {
  BranchNotFoundError,
  CompanyNotFoundError,
  DuplicateBranchCodeError,
  DuplicateCompanyCodeError,
  FiscalPeriodClosedError,
  InMemoryBranchRepository,
  InMemoryCompanyRepository,
  InMemoryFiscalPeriodRepository,
  InMemorySettingRepository,
  InvalidBranchStateError,
  InvalidFiscalPeriodStateError,
  SettingTypeMismatchError,
  assertDateInOpenFiscalPeriod,
  changeFiscalPeriodStatus,
  createBranch,
  createCompany,
  createFiscalPeriod,
  resolveEffectiveSettings,
  resolveSetting,
  setSetting,
  updateBranch,
  type ISettingsClock,
  type SettingsDomainEvent,
} from '../src/index.js';

function createFixedClock(iso = '2026-03-15T10:00:00.000Z'): ISettingsClock {
  return { now: () => new Date(iso) };
}

describe('@modulos/core-settings', () => {
  it('manages companies and branches with unique codes and single headquarters invariant', async () => {
    const companyRepo = new InMemoryCompanyRepository();
    const branchRepo = new InMemoryBranchRepository();
    const events: SettingsDomainEvent[] = [];
    const clock = createFixedClock();

    const company = await createCompany(
      {
        id: 'comp-1',
        code: 'mgb',
        legalName: 'Materiales Garcia y Barragan S.A. de C.V.',
        taxId: 'mgb850101abc',
        taxRegimeCode: '601',
        fiscalAddress: {
          line1: 'Av. Principal 100',
          city: 'Guadalajara',
          state: 'Jalisco',
          postalCode: '44100',
          countryCode: 'MX',
        },
      },
      { companyRepository: companyRepo, eventBus: { publish: (e) => { events.push(e); } }, clock },
    );

    expect(company.code).toBe('MGB');
    expect(company.taxId).toBe('MGB850101ABC');

    await expect(
      createCompany(
        {
          code: 'MGB',
          legalName: 'Otra',
          taxId: 'OTR010101AAA',
          fiscalAddress: { line1: 'Calle 1', city: 'CDMX', postalCode: '01000' },
        },
        { companyRepository: companyRepo },
      ),
    ).rejects.toThrow(DuplicateCompanyCodeError);

    const hq = await createBranch(
      {
        id: 'br-matriz',
        companyId: company.id,
        code: 'matriz',
        name: 'Sucursal Matriz',
        isHeadquarters: true,
        postalCode: '44100',
      },
      { branchRepository: branchRepo, companyRepository: companyRepo, clock },
    );
    expect(hq.code).toBe('MATRIZ');
    expect(hq.isHeadquarters).toBe(true);

    await expect(
      createBranch(
        { companyId: 'missing', code: 'S1', name: 'S1', postalCode: '44100' },
        { branchRepository: branchRepo, companyRepository: companyRepo },
      ),
    ).rejects.toThrow(CompanyNotFoundError);

    await expect(
      createBranch(
        { companyId: company.id, code: 'MATRIZ', name: 'Dup', postalCode: '44100' },
        { branchRepository: branchRepo, companyRepository: companyRepo },
      ),
    ).rejects.toThrow(DuplicateBranchCodeError);

    // Cannot deactivate last active branch
    await expect(
      updateBranch(
        { branchId: hq.id, status: 'INACTIVE' },
        { branchRepository: branchRepo, companyRepository: companyRepo },
      ),
    ).rejects.toThrow(InvalidBranchStateError);

    // Adding a second headquarters demotes the previous one
    const suc2 = await createBranch(
      {
        id: 'br-norte',
        companyId: company.id,
        code: 'NORTE',
        name: 'Sucursal Norte',
        isHeadquarters: true,
        postalCode: '44200',
      },
      { branchRepository: branchRepo, companyRepository: companyRepo, clock },
    );
    const oldHqReloaded = await branchRepo.findById(hq.id);
    expect(suc2.isHeadquarters).toBe(true);
    expect(oldHqReloaded?.isHeadquarters).toBe(false);

    // Now the non-HQ active branch can be deactivated
    const deactivated = await updateBranch(
      { branchId: hq.id, status: 'INACTIVE' },
      { branchRepository: branchRepo, companyRepository: companyRepo, clock },
    );
    expect(deactivated.status).toBe('INACTIVE');

    await expect(
      updateBranch(
        { branchId: 'unknown', name: 'X' },
        { branchRepository: branchRepo, companyRepository: companyRepo },
      ),
    ).rejects.toThrow(BranchNotFoundError);
  });

  it('controls fiscal periods and prevents operations in soft-locked or closed historical periods', async () => {
    const companyRepo = new InMemoryCompanyRepository();
    const periodRepo = new InMemoryFiscalPeriodRepository();
    const clock = createFixedClock();

    await createCompany(
      {
        id: 'comp-1',
        code: 'MGB',
        legalName: 'MGB SA',
        taxId: 'MGB850101ABC',
        fiscalAddress: { line1: 'Calle 1', city: 'GDL', postalCode: '44100' },
      },
      { companyRepository: companyRepo, clock },
    );

    const jan = await createFiscalPeriod(
      {
        id: 'per-2026-01',
        companyId: 'comp-1',
        fiscalYear: 2026,
        periodNumber: 1,
        startsAt: '2026-01-01T00:00:00.000Z',
        endsAt: '2026-01-31T23:59:59.999Z',
      },
      { fiscalPeriodRepository: periodRepo, companyRepository: companyRepo, clock },
    );

    const openPeriod = await assertDateInOpenFiscalPeriod(
      { companyId: 'comp-1', operationDate: '2026-01-15T12:00:00.000Z' },
      { fiscalPeriodRepository: periodRepo },
    );
    expect(openPeriod.id).toBe(jan.id);

    await changeFiscalPeriodStatus(
      { periodId: jan.id, targetStatus: 'SOFT_LOCKED', changedBy: 'admin-1' },
      { fiscalPeriodRepository: periodRepo, clock },
    );

    await expect(
      assertDateInOpenFiscalPeriod(
        { companyId: 'comp-1', operationDate: '2026-01-15T12:00:00.000Z' },
        { fiscalPeriodRepository: periodRepo },
      ),
    ).rejects.toThrow(FiscalPeriodClosedError);

    // Allowed when allowSoftLocked is true
    const allowedSoft = await assertDateInOpenFiscalPeriod(
      { companyId: 'comp-1', operationDate: '2026-01-15T12:00:00.000Z', allowSoftLocked: true },
      { fiscalPeriodRepository: periodRepo },
    );
    expect(allowedSoft.status).toBe('SOFT_LOCKED');

    // Close definitively
    const closed = await changeFiscalPeriodStatus(
      { periodId: jan.id, targetStatus: 'CLOSED', changedBy: 'cfo-1' },
      { fiscalPeriodRepository: periodRepo, clock },
    );
    expect(closed.status).toBe('CLOSED');
    expect(closed.closedBy).toBe('cfo-1');

    // Cannot reopen a closed period
    await expect(
      changeFiscalPeriodStatus(
        { periodId: jan.id, targetStatus: 'OPEN' },
        { fiscalPeriodRepository: periodRepo },
      ),
    ).rejects.toThrow(InvalidFiscalPeriodStateError);
  });

  it('resolves parametric settings in cascade (TERMINAL > BRANCH > COMPANY > GLOBAL) and validates value types', async () => {
    const settingRepo = new InMemorySettingRepository();
    const events: SettingsDomainEvent[] = [];
    const clock = createFixedClock();
    const deps = {
      settingRepository: settingRepo,
      eventBus: { publish: (e: SettingsDomainEvent) => { events.push(e); } },
      clock,
    };

    await expect(
      setSetting(
        {
          scopeType: 'GLOBAL',
          key: 'pos.max_discount_pct',
          valueType: 'NUMBER',
          value: '15' as unknown as number,
        },
        deps,
      ),
    ).rejects.toThrow(SettingTypeMismatchError);

    await setSetting(
      { scopeType: 'GLOBAL', key: 'pos.max_discount_pct', valueType: 'NUMBER', value: 5 },
      deps,
    );
    await setSetting(
      {
        scopeType: 'COMPANY',
        scopeId: 'comp-1',
        key: 'pos.max_discount_pct',
        valueType: 'NUMBER',
        value: 10,
      },
      deps,
    );
    await setSetting(
      {
        scopeType: 'BRANCH',
        scopeId: 'br-matriz',
        key: 'pos.max_discount_pct',
        valueType: 'NUMBER',
        value: 12,
      },
      deps,
    );
    await setSetting(
      {
        scopeType: 'TERMINAL',
        scopeId: 'caja-01',
        key: 'pos.allow_credit_sales',
        valueType: 'BOOLEAN',
        value: true,
      },
      deps,
    );

    const forCaja1 = await resolveSetting(
      {
        key: 'pos.max_discount_pct',
        companyId: 'comp-1',
        branchId: 'br-matriz',
        terminalId: 'caja-01',
      },
      deps,
    );
    expect(forCaja1?.value).toBe(12);
    expect(forCaja1?.resolvedFromScope).toBe('BRANCH');

    const effective = await resolveEffectiveSettings(
      { companyId: 'comp-1', branchId: 'br-matriz', terminalId: 'caja-01', keyPrefix: 'pos.' },
      deps,
    );
    expect(effective['pos.max_discount_pct']?.value).toBe(12);
    expect(effective['pos.allow_credit_sales']?.value).toBe(true);
    expect(events.some((e) => e.type === 'SettingChanged')).toBe(true);
  });
});

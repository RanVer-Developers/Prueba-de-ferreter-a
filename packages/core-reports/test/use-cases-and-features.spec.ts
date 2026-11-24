import { describe, expect, it } from 'vitest';
import {
  ExportedReportPayload,
  ExportReportUseCase,
  GenerateAbcReportUseCase,
  GenerateSalesReportUseCase,
  InMemoryReportDefinitionRepository,
  InvalidReportInputError,
  IReportClock,
  IReportDataSource,
  IReportExporter,
  ManageReportDefinitionsUseCase,
  ReportDefinitionNotFoundError,
  ReportFeatureDisabledError,
  resolveReportFeatures,
  SalesTransactionRecord,
} from '../src/index.js';

const fixedClock: IReportClock = {
  now: () => new Date('2026-11-23T10:00:00.000Z'),
};

function createStubDataSource(
  txs: SalesTransactionRecord[] = []
): IReportDataSource {
  return {
    async fetchSalesTransactions() {
      return txs;
    },
    async fetchInventorySnapshots() {
      return [
        {
          schemaVersion: 1,
          itemId: 'i1',
          name: 'Espresso',
          currency: 'MXN',
          quantityOnHand: 50,
          unitCostCents: 1000,
          totalValueCents: 50000,
          unitsSoldInPeriod: 20,
          revenueInPeriodCents: 60000,
          profitInPeriodCents: 40000,
        },
      ];
    },
  };
}

describe('Use Cases, Feature Flags & Repositories', () => {
  const period = {
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-30T23:59:59Z',
    granularity: 'DAY' as const,
    timezoneOffsetMinutes: 0,
  };

  const filter = {
    currency: 'MXN',
    includeVoided: false,
    includeRefunded: true,
    topLimit: 10,
  };

  it('enforces ReportTier feature flags and strips disabled metrics in BASIC tier', async () => {
    const ds = createStubDataSource([
      {
        schemaVersion: 1,
        id: 'tx-1',
        occurredAt: '2026-11-10T10:00:00Z',
        currency: 'MXN',
        status: 'COMPLETED',
        grossCents: 10000,
        discountCents: 0,
        taxCents: 0,
        netCents: 10000,
        costCents: 4000,
        channel: 'POS',
        branchId: 'b1',
        payments: [{ method: 'CASH', amountCents: 10000 }],
        lines: [],
      },
    ]);

    const salesUseCase = new GenerateSalesReportUseCase(ds);
    const basicProfile = resolveReportFeatures('BASIC');

    const summary = await salesUseCase.generateSummary({
      period,
      filter,
      profile: basicProfile,
    });
    expect(summary.netSalesCents).toBe(10000);
    expect(summary.grossProfitCents).toBe(0); // stripped in BASIC
    expect(summary.channels).toEqual([]); // stripped in BASIC

    await expect(
      salesUseCase.generateTimeSeries({ period, filter, profile: basicProfile })
    ).rejects.toThrow(ReportFeatureDisabledError);

    const abcUseCase = new GenerateAbcReportUseCase(ds);
    await expect(
      abcUseCase.execute({ filter, profile: resolveReportFeatures('INTERMEDIATE') })
    ).rejects.toThrow(ReportFeatureDisabledError);

    const abcResult = await abcUseCase.execute({
      filter,
      profile: resolveReportFeatures('ADVANCED'),
    });
    expect(abcResult.items).toHaveLength(1);
    expect(abcResult.items[0]?.abcClass).toBe('A');
  });

  it('validates invalid period boundaries via Zod at use-case boundary', async () => {
    const salesUseCase = new GenerateSalesReportUseCase(createStubDataSource());

    await expect(
      salesUseCase.generateSummary({
        period: {
          ...period,
          from: '2026-12-01T00:00:00Z',
          to: '2026-11-01T00:00:00Z',
        },
        filter,
      })
    ).rejects.toThrow(InvalidReportInputError);
  });

  it('delivers exported report through IReportExporter port', async () => {
    const delivered: ExportedReportPayload[] = [];
    const exporter: IReportExporter = {
      async deliver(payload) {
        delivered.push(payload);
      },
    };

    const exportUseCase = new ExportReportUseCase(exporter, fixedClock);
    const payload = await exportUseCase.execute({
      dataset: {
        columns: ['Date', 'NetSalesCents'],
        rows: [['2026-11-10', 10000]],
      },
      format: 'CSV',
      filename: 'daily_sales',
    });

    expect(payload.generatedAt).toBe('2026-11-23T10:00:00.000Z');
    expect(delivered).toHaveLength(1);
  });

  it('persists, lists, and deletes saved report definitions', async () => {
    const repo = new InMemoryReportDefinitionRepository();
    const manageUseCase = new ManageReportDefinitionsUseCase(repo, fixedClock);

    const saved = await manageUseCase.save({
      tenantId: 'tenant-1',
      name: 'Monthly Sales KPI',
      type: 'SALES_SUMMARY',
      filter,
      createdBy: 'admin-1',
    });

    expect(saved.schemaVersion).toBe(1);
    const fetched = await manageUseCase.getById(saved.id);
    expect(fetched.name).toBe('Monthly Sales KPI');

    const list = await manageUseCase.list({ tenantId: 'tenant-1' });
    expect(list).toHaveLength(1);

    await manageUseCase.delete(saved.id);
    await expect(manageUseCase.getById(saved.id)).rejects.toThrow(
      ReportDefinitionNotFoundError
    );
  });

  it('supports standard flat resolveReportFeatureFlags alongside legacy resolveReportFeatures', async () => {
    const { resolveReportFeatureFlags } = await import('../src/index.js');
    const flatBasic = resolveReportFeatureFlags('BASIC');
    expect(flatBasic.salesSummary).toBe(true);
    expect(flatBasic.timeSeries).toBe(false);

    const flatCustom = resolveReportFeatureFlags({ timeSeries: true }, 'BASIC');
    expect(flatCustom.timeSeries).toBe(true);
    expect(flatCustom.periodComparison).toBe(false);

    const salesUseCase = new GenerateSalesReportUseCase(createStubDataSource());
    await expect(
      salesUseCase.generateTimeSeries({ period, filter, profile: 'BASIC' })
    ).rejects.toThrow(ReportFeatureDisabledError);
    await expect(
      salesUseCase.generateTimeSeries({ period, filter, features: flatCustom })
    ).resolves.toMatchObject({ granularity: 'DAY' });
  });
});

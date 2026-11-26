import {
  InventorySnapshotRecord,
  ReportFilter,
  ReportPeriod,
  SalesTransactionRecord,
} from '../schemas/report-schemas.js';
import { ExportedReportPayload } from '../domain/services/report-formatter.service.js';

export interface IReportDataSource {
  fetchSalesTransactions(
    period: ReportPeriod,
    filter: ReportFilter
  ): Promise<SalesTransactionRecord[]>;
  fetchInventorySnapshots?(
    filter: ReportFilter
  ): Promise<InventorySnapshotRecord[]>;
}

export interface IReportExporter {
  deliver(payload: ExportedReportPayload): Promise<void>;
}

export interface IReportClock {
  now(): Date;
}

export const SystemReportClock: IReportClock = {
  now: () => new Date(),
};

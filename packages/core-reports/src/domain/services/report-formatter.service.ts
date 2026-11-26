import { UnsupportedExportFormatError } from '../errors/report-errors.js';
import { ExportFormat } from '../../schemas/report-schemas.js';

export type TabularCell = string | number | boolean | null | undefined;

export interface TabularDataset {
  columns: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<TabularCell>>;
}

export interface ExportedReportPayload {
  format: ExportFormat;
  filename: string;
  mimeType: string;
  content: string;
  rowCount: number;
  generatedAt: string;
}

const FORMULA_PREFIX_REGEX = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV cell per RFC 4180 and neutralizes CSV formula injection payloads.
 */
export function escapeCsvCell(value: TabularCell): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
  if (typeof value === 'string' && FORMULA_PREFIX_REGEX.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Formats a tabular dataset into RFC 4180 CSV or structured JSON.
 */
export function formatTabularExport(
  dataset: TabularDataset,
  format: ExportFormat,
  baseFilename: string,
  generatedAtIso: string
): ExportedReportPayload {
  const safeBase = baseFilename.replace(/[^a-zA-Z0-9_-]/g, '_') || 'report';

  if (format === 'CSV') {
    const headerLine = dataset.columns.map(escapeCsvCell).join(',');
    const dataLines = dataset.rows.map((row) => row.map(escapeCsvCell).join(','));
    const content = [headerLine, ...dataLines].join('\r\n');

    return {
      format: 'CSV',
      filename: `${safeBase}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content,
      rowCount: dataset.rows.length,
      generatedAt: generatedAtIso,
    };
  }

  if (format === 'JSON') {
    const objects = dataset.rows.map((row) => {
      const record: Record<string, TabularCell> = {};
      dataset.columns.forEach((col, idx) => {
        record[col] = row[idx] ?? null;
      });
      return record;
    });

    return {
      format: 'JSON',
      filename: `${safeBase}.json`,
      mimeType: 'application/json;charset=utf-8',
      content: JSON.stringify(
        {
          generatedAt: generatedAtIso,
          rowCount: objects.length,
          data: objects,
        },
        null,
        2
      ),
      rowCount: objects.length,
      generatedAt: generatedAtIso,
    };
  }

  throw new UnsupportedExportFormatError(String(format));
}

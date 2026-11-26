import { generateId } from '@modulos/core-shared';
import { type SanitizedErrorLog, SanitizedErrorLogSchema } from '../schemas/ferreteria.schemas.js';

const MAX_LOG_ENTRIES = 50;

const SENSITIVE_PATTERNS = [
  /\bpin\s*[:=]\s*\S+/gi,
  /\bpassword\s*[:=]\s*\S+/gi,
  /\btoken\s*[:=]\s*\S+/gi,
  /\bsecret\s*[:=]\s*\S+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
];

export function sanitizeErrorMessage(rawMessage: string): string {
  let clean = rawMessage.trim();
  for (const pattern of SENSITIVE_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean.slice(0, 300);
}

export class LocalErrorLogger {
  private entries: SanitizedErrorLog[] = [];

  record(input: {
    screen: string;
    action: string;
    error: unknown;
    timestamp?: string;
  }): SanitizedErrorLog {
    const errObj = input.error instanceof Error ? input.error : null;
    const rawCode =
      errObj && 'code' in errObj && typeof (errObj as { code?: unknown }).code === 'string'
        ? (errObj as { code: string }).code
        : errObj?.name ?? 'UNKNOWN_ERROR';
    const rawMsg = errObj ? errObj.message : String(input.error);

    const entry = SanitizedErrorLogSchema.parse({
      id: generateId('err'),
      timestamp: input.timestamp ?? new Date().toISOString(),
      screen: input.screen,
      action: input.action,
      code: rawCode,
      message: sanitizeErrorMessage(rawMsg),
    });

    this.entries.unshift(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_LOG_ENTRIES);
    }

    return entry;
  }

  list(): SanitizedErrorLog[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  exportTextReport(): string {
    if (this.entries.length === 0) {
      return 'Sin errores recientes registrados.';
    }
    return this.entries
      .map(
        (e) =>
          `[${e.timestamp}] (${e.screen} -> ${e.action}) [${e.code}] ${e.message}`
      )
      .join('\n');
  }
}

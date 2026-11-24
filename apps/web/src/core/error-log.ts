export interface ErrorLogEntry {
  timestamp: string;
  screen: string;
  action: string;
  detail: string;
}

const STORAGE_KEY = "ferre_alfredo_error_log_v1";
const MAX_ENTRIES = 50;

function sanitize(detail: string): string {
  return detail
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/pin["']?\s*[:=]\s*["']?\d+/gi, "pin=[REDACTED]")
    .slice(0, 400);
}

export function getErrorLogs(): ErrorLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordErrorLog(
  screen: string,
  action: string,
  error: unknown
): void {
  const detail =
    error instanceof Error ? error.message : String(error ?? "Error desconocido");
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    screen,
    action,
    detail: sanitize(detail),
  };
  try {
    const next = [entry, ...getErrorLogs()].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage quota exceeded or unavailable; ignore gracefully
  }
}

export function buildTechnicalReport(): string {
  const logs = getErrorLogs();
  const header = [
    "=== REPORTE TÉCNICO FERRE ALFREDO ===",
    `Fecha: ${new Date().toLocaleString("es-MX")}`,
    `Conexión: ${navigator.onLine ? "En línea" : "Sin internet (modo local)"}`,
    `Eventos recientes: ${logs.length}`,
  ];
  if (logs.length === 0) {
    return [...header, "Sin errores recientes registrados."].join("\n");
  }
  const lines = logs.map(
    (l) => `[${l.timestamp}] (${l.screen} -> ${l.action}): ${l.detail}`
  );
  return [...header, ...lines].join("\n");
}

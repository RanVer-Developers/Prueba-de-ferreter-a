/**
 * Generates collision-free identifiers using crypto.randomUUID().
 */
export function generateId(prefix?: string): string {
  const uuid = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}-${uuid}` : uuid;
}

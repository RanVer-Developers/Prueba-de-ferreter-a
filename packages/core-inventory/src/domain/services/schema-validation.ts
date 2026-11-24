import { generateId } from '@modulos/core-shared';

export const INVENTORY_SCHEMA_VERSION = 1;

/**
 * Genera identificadores únicos criptográficos (UUID v4) para capas, eventos y movimientos.
 */
export function generateInventoryId(prefix: string): string {
  return generateId(prefix);
}

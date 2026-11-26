import { generateId, roundHalfEven } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemPurchasingClock,
  type IInventoryReturnPort,
  type IPurchasingClock,
  type IPurchasingEventBus,
} from '../contracts/purchasing-contracts.js';
import {
  InvalidPurchasingInputError,
  SupplierNotFoundError,
} from '../domain/errors/purchasing-errors.js';
import type { ISupplierReturnRepository } from '../repositories/supplier-payable-repository.interface.js';
import type { ISupplierRepository } from '../repositories/supplier-repository.interface.js';
import {
  PURCHASING_SCHEMA_VERSION,
  SupplierReturnSchema,
  type SupplierReturn,
  type SupplierReturnLine,
} from '../schemas/purchasing.schemas.js';

export const SupplierReturnLineInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unitCostCents: z.number().int().nonnegative(),
  reason: z.string().min(1),
  lotNumber: z.string().min(1).optional(),
});

export const RecordSupplierReturnInputSchema = z.object({
  id: z.string().min(1).optional(),
  returnNumber: z.string().min(1).optional(),
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  receiptId: z.string().min(1).optional(),
  lines: z.array(SupplierReturnLineInputSchema).min(1),
  createdBy: z.string().min(1).optional(),
  notes: z.string().optional(),
  returnedAt: z.string().datetime().optional(),
});
export type RecordSupplierReturnInput = z.input<typeof RecordSupplierReturnInputSchema>;

export interface RecordSupplierReturnDeps {
  supplierRepository: ISupplierRepository;
  supplierReturnRepository: ISupplierReturnRepository;
  inventoryReturnPort?: IInventoryReturnPort;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
}

export async function recordSupplierReturn(
  rawInput: RecordSupplierReturnInput,
  deps: RecordSupplierReturnDeps,
): Promise<SupplierReturn> {
  const parsed = RecordSupplierReturnInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid supplier return input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const data = parsed.data;
  const supplier = await deps.supplierRepository.findById(data.supplierId);
  if (!supplier) {
    throw new SupplierNotFoundError(data.supplierId);
  }

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const returnedAt = data.returnedAt ?? now;
  const id = data.id ?? generateId('sret');
  const returnNumber = data.returnNumber ?? `RET-${id.slice(-8).toUpperCase()}`;

  let totalCents = 0;
  const lines: SupplierReturnLine[] = data.lines.map((line) => {
    const lineTotalCents = roundHalfEven(line.quantity * line.unitCostCents);
    totalCents += lineTotalCents;
    return {
      id: generateId('sretl'),
      productId: line.productId,
      quantity: line.quantity,
      unitCostCents: line.unitCostCents,
      lineTotalCents,
      reason: line.reason,
      lotNumber: line.lotNumber,
    };
  });

  const supplierReturn = SupplierReturnSchema.parse({
    schemaVersion: PURCHASING_SCHEMA_VERSION,
    id,
    returnNumber,
    supplierId: supplier.id,
    warehouseId: data.warehouseId,
    receiptId: data.receiptId,
    currency: supplier.currency,
    lines,
    totalCents,
    createdBy: data.createdBy,
    notes: data.notes,
    returnedAt,
    createdAt: now,
  });

  await deps.supplierReturnRepository.save(supplierReturn);

  if (deps.inventoryReturnPort) {
    await deps.inventoryReturnPort.recordSupplierReturnStock({
      returnId: supplierReturn.id,
      returnNumber: supplierReturn.returnNumber,
      supplierId: supplierReturn.supplierId,
      warehouseId: supplierReturn.warehouseId,
      receiptId: supplierReturn.receiptId,
      createdBy: supplierReturn.createdBy,
      returnedAt: supplierReturn.returnedAt,
      lines: supplierReturn.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        reason: l.reason,
        lotNumber: l.lotNumber,
      })),
    });
  }

  await deps.eventBus?.publish({
    type: 'SupplierReturnRecorded',
    returnId: supplierReturn.id,
    supplierId: supplierReturn.supplierId,
    warehouseId: supplierReturn.warehouseId,
    totalCents: supplierReturn.totalCents,
    occurredAt: now,
  });

  return supplierReturn;
}

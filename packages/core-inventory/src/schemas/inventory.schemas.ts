import { z } from 'zod';
import { StockMovementType } from '../domain/entities/stock-movement.js';
import { SchemaValidationError } from '../domain/errors/inventory-errors.js';
import { INVENTORY_SCHEMA_VERSION } from '../domain/services/schema-validation.js';

export const NonEmptyStringSchema = z.string().trim().min(1);

export const InventorySchemaVersionSchema = z
  .number()
  .int()
  .min(1)
  .refine((v) => v <= INVENTORY_SCHEMA_VERSION, {
    error: (iss) =>
      `schemaVersion ${String(iss.input)} no soportado (máximo soportado: ${INVENTORY_SCHEMA_VERSION}).`,
  });

export const MoneyJSONSchema = z.object({
  cents: z.number().int(),
  currency: NonEmptyStringSchema,
});

export const UserSummarySchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  role: z.string().optional(),
});

export const UnitOfMeasureJSONSchema = z.object({
  code: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  category: z.enum(['DISCRETE', 'WEIGHT', 'VOLUME', 'LENGTH', 'CUSTOM']),
  precision: z.number().int().min(0),
  baseUnitCode: z.string().optional(),
  conversionFactorToBase: z.number().finite().positive().optional(),
});

export const InventoryLayerJSONSchema = z.object({
  id: NonEmptyStringSchema,
  receivedAt: NonEmptyStringSchema,
  quantity: z.number().finite().min(0),
  remainingQuantity: z.number().finite().min(0),
  unitCost: MoneyJSONSchema,
  referenceId: z.string().optional(),
});

export const BatchLotJSONSchema = z.object({
  lotNumber: NonEmptyStringSchema,
  expirationDate: NonEmptyStringSchema,
  manufacturingDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'QUARANTINED', 'EXPIRED', 'RECALLED']),
  initialQuantity: z.number().finite().min(0),
  currentQuantity: z.number().finite().min(0),
  costPerUnit: MoneyJSONSchema,
});

export const SerialNumberJSONSchema = z.object({
  serialNumber: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  status: z.enum(['IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED', 'IN_TRANSIT', 'DAMAGED', 'LOST']),
  cost: MoneyJSONSchema.optional(),
  registeredAt: NonEmptyStringSchema,
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

export const BinLocationJSONSchema = z.object({
  aisle: NonEmptyStringSchema,
  rack: NonEmptyStringSchema,
  shelf: NonEmptyStringSchema,
  bin: NonEmptyStringSchema,
  zone: z.string().optional(),
  code: NonEmptyStringSchema,
});

export const ReorderRulesSchema = z.object({
  minStock: z.number().finite().min(0),
  maxStock: z.number().finite().min(0).optional(),
  reorderPoint: z.number().finite().min(0),
});

export const WarehouseStockJSONSchema = z.object({
  warehouseId: NonEmptyStringSchema,
  onHand: z.number().finite(),
  reserved: z.number().finite().min(0),
  inTransit: z.number().finite().min(0),
  layers: z.array(InventoryLayerJSONSchema),
  lots: z.array(BatchLotJSONSchema),
  serials: z.array(SerialNumberJSONSchema),
  binLocations: z.array(BinLocationJSONSchema).optional(),
});

export const InventoryItemJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  sku: NonEmptyStringSchema,
  barcode: z.string().optional(),
  barcodes: z.array(z.string()).optional(),
  name: NonEmptyStringSchema,
  description: z.string().optional(),
  uom: UnitOfMeasureJSONSchema,
  valuationMethod: z.enum(['FIFO', 'WEIGHTED_AVERAGE', 'STANDARD_COST']),
  averageCost: MoneyJSONSchema,
  standardCost: MoneyJSONSchema.optional(),
  reorderRules: ReorderRulesSchema,
  warehouseReorderRules: z.record(z.string(), ReorderRulesSchema).optional(),
  trackingType: z.enum(['SIMPLE', 'BATCH_LOT', 'SERIAL']),
  stocks: z.record(z.string(), WarehouseStockJSONSchema),
  version: z.number().int().min(0),
});

export const WarehouseJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  code: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  isActive: z.boolean(),
  allowNegativeStock: z.boolean(),
  address: z.string().optional(),
  isTransitWarehouse: z.boolean(),
});

export const StockMovementJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  itemId: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  type: z.nativeEnum(StockMovementType),
  quantity: z.number().finite().min(0),
  balanceBefore: z.number().finite(),
  balanceAfter: z.number().finite(),
  unitCost: MoneyJSONSchema,
  totalCost: MoneyJSONSchema,
  referenceId: z.string().optional(),
  lotNumber: z.string().optional(),
  serialNumbers: z.array(z.string()).optional(),
  performedBy: UserSummarySchema,
  authorizedBy: UserSummarySchema.optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
  createdAt: NonEmptyStringSchema,
});

export const StockReservationJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  itemId: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  quantity: z.number().finite().positive(),
  referenceId: NonEmptyStringSchema,
  expiresAt: NonEmptyStringSchema,
  status: z.enum(['ACTIVE', 'COMMITTED', 'RELEASED', 'EXPIRED']),
  serialNumbers: z.array(z.string()).optional(),
  createdAt: NonEmptyStringSchema,
});

export const StockTransferJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  fromWarehouseId: NonEmptyStringSchema,
  toWarehouseId: NonEmptyStringSchema,
  itemId: NonEmptyStringSchema,
  quantitySent: z.number().finite().positive(),
  quantityReceived: z.number().finite().min(0).optional(),
  status: z.enum(['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'DISCREPANCY', 'CANCELLED']),
  lotNumber: z.string().optional(),
  serialNumbers: z.array(z.string()).optional(),
  dispatchedAt: z.string().optional(),
  receivedAt: z.string().optional(),
  dispatchedBy: UserSummarySchema.optional(),
  receivedBy: UserSummarySchema.optional(),
  discrepancyReason: z.string().optional(),
  notes: z.string().optional(),
});

export const CompositeProductJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  compositeItemId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  components: z.array(
    z.object({
      itemId: NonEmptyStringSchema,
      quantity: z.number().finite().positive(),
    })
  ),
});

export const InventoryCountJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  isBlind: z.boolean(),
  status: z.enum(['OPEN', 'RECONCILED', 'CANCELLED']),
  items: z.array(
    z.object({
      itemId: NonEmptyStringSchema,
      systemQuantity: z.number().finite(),
      countedQuantity: z.number().finite().min(0),
      difference: z.number().finite(),
      unitCost: MoneyJSONSchema,
      differenceValue: MoneyJSONSchema,
      countedBy: NonEmptyStringSchema,
      notes: z.string().optional(),
    })
  ),
  createdAt: NonEmptyStringSchema,
  reconciledAt: z.string().optional(),
  reconciledBy: UserSummarySchema.optional(),
  authorizedBy: UserSummarySchema.optional(),
});

export const ReceivingOrderJSONSchema = z.object({
  schemaVersion: InventorySchemaVersionSchema.default(INVENTORY_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  orderNumber: NonEmptyStringSchema,
  warehouseId: NonEmptyStringSchema,
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED']),
  items: z.array(
    z.object({
      itemId: NonEmptyStringSchema,
      expectedQuantity: z.number().finite().positive(),
      receivedQuantity: z.number().finite().min(0),
      pendingQuantity: z.number().finite().min(0),
      unitCost: MoneyJSONSchema,
      notes: z.string().optional(),
    })
  ),
  createdAt: NonEmptyStringSchema,
  updatedAt: z.string().optional(),
  notes: z.string().optional(),
});

export function parseWithInventorySchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  entity: string
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ');
  throw new SchemaValidationError(entity, details);
}

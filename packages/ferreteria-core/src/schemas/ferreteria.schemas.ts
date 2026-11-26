import { z } from 'zod';

export const FERRETERIA_SCHEMA_VERSION = 1 as const;

export const SaleUnitKindSchema = z.enum(['PIECE', 'METER', 'KG', 'BOX']);
export type SaleUnitKind = z.infer<typeof SaleUnitKindSchema>;

export const HardwareProductProfileSchema = z.object({
  schemaVersion: z.literal(FERRETERIA_SCHEMA_VERSION).default(FERRETERIA_SCHEMA_VERSION),
  itemId: z.string().min(1),
  sku: z.string().min(1),
  officialName: z.string().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  measures: z.array(z.string().trim().min(1)).default([]),
  category: z.string().min(1).default('General'),
  aisle: z.string().min(1).default('A1'),
  shelf: z.string().min(1).default('E1'),
  baseUnit: SaleUnitKindSchema.default('PIECE'),
  packLabel: z.string().trim().min(1).optional(),
  unitsPerPack: z.number().positive().default(1),
  publicPriceCents: z.number().int().nonnegative(),
  wholesalePriceCents: z.number().int().nonnegative(),
  wholesaleMinQty: z.number().positive().default(10),
  packPriceCents: z.number().int().nonnegative().optional(),
  lastCostCents: z.number().int().nonnegative().default(0),
  minStockQty: z.number().nonnegative().default(5),
});

export type HardwareProductProfile = z.infer<typeof HardwareProductProfileSchema>;

export const QuoteReservationLineSchema = z.object({
  reservationId: z.string().min(1),
  itemId: z.string().min(1),
  quantityInBaseUnits: z.number().positive(),
});

export const QuoteRecordSchema = z.object({
  schemaVersion: z.literal(FERRETERIA_SCHEMA_VERSION).default(FERRETERIA_SCHEMA_VERSION),
  quoteId: z.string().min(1),
  customerName: z.string().min(1),
  customerId: z.string().optional(),
  status: z.enum(['PENDING', 'RESERVED', 'CONVERTED', 'EXPIRED']).default('PENDING'),
  reservations: z.array(QuoteReservationLineSchema).default([]),
  convertedOrderId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type QuoteRecord = z.infer<typeof QuoteRecordSchema>;

export const DeliveryModeSchema = z.enum(['COUNTER_IMMEDIATE', 'WAREHOUSE_PICKUP', 'HOME_DELIVERY']);
export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;

export const WarehouseDispatchSchema = z.object({
  schemaVersion: z.literal(FERRETERIA_SCHEMA_VERSION).default(FERRETERIA_SCHEMA_VERSION),
  orderId: z.string().min(1),
  shipmentId: z.string().optional(),
  customerName: z.string().min(1),
  deliveryMode: DeliveryModeSchema,
  paymentAuthorized: z.boolean(),
  authorizationKind: z.enum(['PAID', 'AUTHORIZED_CREDIT', 'UNPAID']),
  status: z.enum(['BLOCKED_UNPAID', 'READY_FOR_DISPATCH', 'DISPATCHED']),
  itemsSummary: z.array(
    z.object({
      itemId: z.string().min(1),
      name: z.string().min(1),
      quantity: z.number().positive(),
      unitLabel: z.string().min(1),
      aisle: z.string().min(1),
      shelf: z.string().min(1),
    })
  ),
  dispatchedBy: z.string().optional(),
  dispatchedAt: z.string().optional(),
  createdAt: z.string().min(1),
});

export type WarehouseDispatch = z.infer<typeof WarehouseDispatchSchema>;

export const CreditNoteTrackSchema = z.object({
  schemaVersion: z.literal(FERRETERIA_SCHEMA_VERSION).default(FERRETERIA_SCHEMA_VERSION),
  noteId: z.string().min(1),
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  originalTotalCents: z.number().int().positive(),
  paidCents: z.number().int().nonnegative().default(0),
  remainingCents: z.number().int().nonnegative(),
  dueAt: z.string().min(1),
  status: z.enum(['OPEN', 'PARTIAL', 'PAID', 'OVERDUE']),
  createdAt: z.string().min(1),
});

export type CreditNoteTrack = z.infer<typeof CreditNoteTrackSchema>;

export const SanitizedErrorLogSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  screen: z.string().min(1),
  action: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
});

export type SanitizedErrorLog = z.infer<typeof SanitizedErrorLogSchema>;

export const BackupSnapshotSchema = z.object({
  schemaVersion: z.literal(FERRETERIA_SCHEMA_VERSION),
  exportedAt: z.string().min(1),
  businessName: z.string().min(1),
  products: z.array(HardwareProductProfileSchema),
  quotes: z.array(QuoteRecordSchema),
  dispatches: z.array(WarehouseDispatchSchema),
  creditNotes: z.array(CreditNoteTrackSchema),
  controls: z.record(z.string(), z.unknown()),
  moduleSnapshots: z.record(z.string(), z.array(z.unknown())),
});

export type BackupSnapshot = z.infer<typeof BackupSnapshotSchema>;

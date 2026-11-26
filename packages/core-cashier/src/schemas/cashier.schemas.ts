import { z } from 'zod';
import { IsoDateTimeSchema } from '@modulos/core-shared';
import {
  CashRegisterStatus,
} from '../domain/entities/cash-register.js';
import {
  ExpenseCategory,
  MovementType,
} from '../domain/entities/cash-movement.js';
import { DiscrepancyStatus } from '../domain/entities/cash-reconciliation.js';
import { ShiftStatus } from '../domain/entities/cash-shift.js';
import { InvalidCashierInputError } from '../domain/errors/cashier-errors.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';

export const CASHIER_SCHEMA_VERSION = 1 as const;

export const NonEmptyStringSchema = z.string().trim().min(1);
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'La moneda debe ser un código ISO 4217 de 3 letras.');

export const SchemaVersionSchema = z
  .number()
  .int()
  .min(1)
  .refine((v) => v <= CASHIER_SCHEMA_VERSION, {
    message: `schemaVersion no soportado (máximo soportado: ${CASHIER_SCHEMA_VERSION}).`,
  });

export const UserSummarySchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  role: z.string().trim().min(1).optional(),
});

export const CashBreakdownJSONSchema = z.object({
  items: z.array(
    z.object({
      denomination: z.number().finite().positive(),
      count: z.number().int().min(0),
      subtotal: z.number().finite().min(0),
    })
  ),
  total: z.number().finite().min(0),
  currency: CurrencyCodeSchema,
});

export const PosVoucherBatchJSONSchema = z.object({
  terminalId: NonEmptyStringSchema,
  batchNumber: NonEmptyStringSchema,
  paymentMethod: z.nativeEnum(PaymentMethod),
  voucherCount: z.number().int().min(0),
  totalAmount: z.number().finite().min(0),
});

export const ExchangeRateJSONSchema = z.object({
  fromCurrency: CurrencyCodeSchema,
  toCurrency: CurrencyCodeSchema,
  rate: z.number().finite().positive(),
  asOf: IsoDateTimeSchema,
});

export const CashMovementJSONSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(CASHIER_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  shiftId: NonEmptyStringSchema,
  type: z.nativeEnum(MovementType),
  amount: z.number().finite().positive(),
  currency: CurrencyCodeSchema,
  paymentMethod: z.nativeEnum(PaymentMethod),
  concept: NonEmptyStringSchema,
  referenceId: z.string().trim().min(1).optional(),
  performedBy: UserSummarySchema,
  idempotencyKey: z.string().trim().min(1).optional(),
  sequenceNumber: z.number().int().min(1).optional(),
  foreignAmount: z
    .object({
      amount: z.number().finite().positive(),
      currency: CurrencyCodeSchema,
    })
    .optional(),
  exchangeRate: z.number().finite().positive().optional(),
  exchangeRateDetails: ExchangeRateJSONSchema.optional(),
  expenseDetails: z
    .object({
      category: z.nativeEnum(ExpenseCategory),
      supplierName: z.string().optional(),
      supplierTaxId: z.string().optional(),
      invoiceNumber: z.string().optional(),
    })
    .optional(),
  tipDetails: z
    .object({
      serverEmployeeId: z.string().optional(),
      serverName: z.string().optional(),
      payoutReferenceId: z.string().optional(),
    })
    .optional(),
  safeDropDetails: z
    .object({
      envelopeNumber: z.string().optional(),
      bagSealNumber: z.string().optional(),
      witness: UserSummarySchema.optional(),
      destinationVault: z.string().optional(),
    })
    .optional(),
  settlement: z
    .object({
      tendered: z.number().finite().min(0),
      change: z.number().finite().min(0),
      changeBreakdown: CashBreakdownJSONSchema.optional(),
      roundingAdjustment: z.number().finite().optional(),
    })
    .optional(),
  adjustmentDirection: z.enum(['IN', 'OUT']).optional(),
  voidDetails: z
    .object({
      voidedMovementId: NonEmptyStringSchema,
      reason: NonEmptyStringSchema,
      authorizedBy: UserSummarySchema,
      authorizedAt: IsoDateTimeSchema,
    })
    .optional(),
  isVoided: z.boolean(),
  affectsCashDrawer: z.boolean().optional(),
  timestamp: IsoDateTimeSchema,
});

export const CashReconciliationJSONSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(CASHIER_SCHEMA_VERSION),
  shiftId: NonEmptyStringSchema,
  expectedCash: z.number().finite(),
  declaredCash: z.number().finite().min(0),
  cashDifference: z.number().finite(),
  cashStatus: z.nativeEnum(DiscrepancyStatus),
  currency: CurrencyCodeSchema,
  retainedFloatAmount: z.number().finite().min(0).optional(),
  bankDepositAmount: z.number().finite().min(0).optional(),
  cashBreakdown: CashBreakdownJSONSchema.optional(),
  posVoucherBatches: z.array(PosVoucherBatchJSONSchema).optional(),
  methods: z.array(
    z.object({
      method: z.nativeEnum(PaymentMethod),
      expected: z.number().finite(),
      declared: z.number().finite(),
      difference: z.number().finite(),
      status: z.nativeEnum(DiscrepancyStatus),
    })
  ),
  notes: z.string().optional(),
  reconciledAt: IsoDateTimeSchema,
  auditorId: z.string().optional(),
  supervisorId: z.string().optional(),
  signatureToken: z.string().optional(),
  isBlindCount: z.boolean(),
});

export const SuspensionRecordSnapshotSchema = z.object({
  action: z.enum(['SUSPEND', 'LOCK']),
  reason: NonEmptyStringSchema,
  timestamp: IsoDateTimeSchema,
  authorizedBy: UserSummarySchema.optional(),
  resumedAt: IsoDateTimeSchema.optional(),
  resumedBy: UserSummarySchema.optional(),
});

export const HandoverRecordSnapshotSchema = z.object({
  outgoingCashier: UserSummarySchema,
  incomingCashier: UserSummarySchema,
  timestamp: IsoDateTimeSchema,
  intermediateReconciliation: CashReconciliationJSONSchema,
  notes: z.string().optional(),
});

export const DrawerOpenRecordSnapshotSchema = z.object({
  reason: NonEmptyStringSchema,
  performedBy: UserSummarySchema,
  authorizedBy: UserSummarySchema.optional(),
  timestamp: IsoDateTimeSchema,
});

export const DenominationExchangeRecordSnapshotSchema = z.object({
  id: NonEmptyStringSchema,
  amount: z.number().finite().positive(),
  currency: CurrencyCodeSchema,
  inBreakdown: CashBreakdownJSONSchema,
  outBreakdown: CashBreakdownJSONSchema,
  performedBy: UserSummarySchema,
  authorizedBy: UserSummarySchema.optional(),
  reason: z.string().optional(),
  idempotencyKey: z.string().optional(),
  timestamp: IsoDateTimeSchema,
});

export const ShiftReportDataSchema = z.object({
  reportType: z.enum(['X', 'Z']),
  reportTitle: NonEmptyStringSchema,
  reportNumber: z.number().int().min(1).optional(),
  generatedAt: IsoDateTimeSchema,
  isFiscalFinalCut: z.boolean(),
  shiftId: NonEmptyStringSchema,
  cashRegisterId: NonEmptyStringSchema,
  cashRegisterName: z.string().optional(),
  cashierId: NonEmptyStringSchema,
  cashierName: NonEmptyStringSchema,
  openedAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.optional(),
  currency: CurrencyCodeSchema,
  initialBalance: z.number().finite(),
  grossSales: z.number().finite(),
  refunds: z.number().finite(),
  netSales: z.number().finite(),
  tipsCollected: z.number().finite(),
  tipsPaidOut: z.number().finite(),
  unpaidTips: z.number().finite(),
  deposits: z.number().finite(),
  withdrawals: z.number().finite(),
  safeDrops: z.number().finite(),
  voidedTotal: z.number().finite(),
  currentCashInDrawer: z.number().finite(),
  reconciliation: z
    .object({
      expectedCash: z.number().finite(),
      declaredCash: z.number().finite(),
      difference: z.number().finite(),
      status: z.nativeEnum(DiscrepancyStatus),
      retainedFloat: z.number().finite().optional(),
      bankDeposit: z.number().finite().optional(),
      supervisorId: z.string().optional(),
      signatureToken: z.string().optional(),
      isBlindCount: z.boolean(),
      cashBreakdown: CashBreakdownJSONSchema.optional(),
      posVoucherBatches: z.array(PosVoucherBatchJSONSchema).optional(),
    })
    .optional(),
  totalsByMethod: z.array(
    z.object({
      method: z.nativeEnum(PaymentMethod),
      in: z.number().finite(),
      out: z.number().finite(),
      net: z.number().finite(),
    })
  ),
  expensesByCategory: z.record(z.string(), z.number().finite()),
  movementsCount: z.number().int().min(0),
  drawerOpeningsCount: z.number().int().min(0).optional(),
});

export const CashShiftSnapshotSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(CASHIER_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  cashRegisterId: NonEmptyStringSchema,
  cashier: UserSummarySchema,
  currency: CurrencyCodeSchema,
  status: z.nativeEnum(ShiftStatus),
  initialBalance: z.number().finite().min(0),
  initialBreakdown: CashBreakdownJSONSchema.optional(),
  drawerBreakdown: CashBreakdownJSONSchema,
  maxCashThreshold: z.number().finite().min(0).optional(),
  openedAt: IsoDateTimeSchema,
  closedAt: IsoDateTimeSchema.optional(),
  movements: z.array(CashMovementJSONSchema),
  suspensionHistory: z.array(SuspensionRecordSnapshotSchema),
  handoverHistory: z.array(HandoverRecordSnapshotSchema),
  drawerOpenHistory: z.array(DrawerOpenRecordSnapshotSchema).optional(),
  denominationExchangeHistory: z.array(DenominationExchangeRecordSnapshotSchema).optional(),
  reconciliation: CashReconciliationJSONSchema.optional(),
  zReport: ShiftReportDataSchema.optional(),
  xReportCount: z.number().int().min(0),
  openingNotes: z.string().optional(),
  closingNotes: z.string().optional(),
  version: z.number().int().min(0),
});

export const CashShiftJSONInputSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(CASHIER_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  cashRegisterId: NonEmptyStringSchema,
  cashier: UserSummarySchema,
  currency: CurrencyCodeSchema,
  status: z.nativeEnum(ShiftStatus),
  initialBalance: z.number().finite().min(0),
  initialBreakdown: CashBreakdownJSONSchema.optional(),
  drawerBreakdown: CashBreakdownJSONSchema.optional(),
  maxCashThreshold: z.number().finite().min(0).optional(),
  openedAt: NonEmptyStringSchema,
  closedAt: z.string().optional(),
  movements: z.array(CashMovementJSONSchema).default([]),
  suspensionHistory: z.array(SuspensionRecordSnapshotSchema).default([]),
  handoverHistory: z.array(HandoverRecordSnapshotSchema).default([]),
  drawerOpenHistory: z.array(DrawerOpenRecordSnapshotSchema).default([]),
  denominationExchangeHistory: z.array(DenominationExchangeRecordSnapshotSchema).default([]),
  reconciliation: CashReconciliationJSONSchema.optional(),
  zReport: ShiftReportDataSchema.optional(),
  xReportCount: z.number().int().min(0).default(0),
  openingNotes: z.string().optional(),
  closingNotes: z.string().optional(),
  version: z.number().int().min(0).default(0),
});

export const CashRegisterJSONSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(CASHIER_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  branchId: z.string().trim().min(1).optional(),
  currency: CurrencyCodeSchema,
  status: z.nativeEnum(CashRegisterStatus).default(CashRegisterStatus.ACTIVE),
  activeShiftId: z.string().nullable(),
  maxCashThreshold: z.number().finite().min(0).optional(),
  carryOverFloat: z.number().finite().min(0).optional(),
  carryOverBreakdown: CashBreakdownJSONSchema.optional(),
  lastZReportNumber: z.number().int().min(0).default(0),
  isOpen: z.boolean().optional(),
  createdAt: NonEmptyStringSchema,
  updatedAt: NonEmptyStringSchema,
});

export function parseWithCashierSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  context: string
): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ');
  throw new InvalidCashierInputError(`Datos inválidos en ${context}: ${details}`);
}

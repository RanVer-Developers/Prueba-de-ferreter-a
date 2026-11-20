import { CashBreakdownJSON } from '../value-objects/cash-denomination.js';
import { PaymentMethod } from '../value-objects/payment-method.js';
import { DiscrepancyStatus, PosVoucherBatchJSON } from './cash-reconciliation.js';

export interface ReportTotalsByMethod {
  method: PaymentMethod;
  in: number;
  out: number;
  net: number;
}

export interface ShiftReportData {
  reportType: 'X' | 'Z';
  reportTitle: string;
  reportNumber?: number;     // Z: consecutivo por caja (inmutable). X: consecutivo por turno.
  generatedAt: string;
  isFiscalFinalCut: boolean; // True en Z, False en X
  shiftId: string;
  cashRegisterId: string;
  cashRegisterName?: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  currency: string;
  initialBalance: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  tipsCollected: number;
  tipsPaidOut: number;
  unpaidTips: number;
  deposits: number;
  withdrawals: number;
  safeDrops: number;
  voidedTotal: number;
  currentCashInDrawer: number;
  reconciliation?: {
    expectedCash: number;
    declaredCash: number;
    difference: number;
    status: DiscrepancyStatus;
    retainedFloat?: number;
    bankDeposit?: number;
    supervisorId?: string;
    signatureToken?: string;
    isBlindCount: boolean;
    cashBreakdown?: CashBreakdownJSON;
    posVoucherBatches?: PosVoucherBatchJSON[];
  };
  totalsByMethod: ReportTotalsByMethod[];
  expensesByCategory: Record<string, number>;
  movementsCount: number;
  drawerOpeningsCount?: number;
}

import { CashBreakdown } from '../value-objects/cash-denomination.js';
import { InvalidMoneyAmountError } from '../errors/cashier-errors.js';
import { Money } from '../value-objects/money.js';
import { PaymentMethod } from '../value-objects/payment-method.js';

export interface PosVoucherBatch {
  terminalId: string;       // Identificador del terminal o datáfono (TID)
  batchNumber: string;      // Número de lote o cierre del terminal bancario
  paymentMethod: PaymentMethod; // DEBIT_CARD, CREDIT_CARD, etc.
  voucherCount: number;     // Cantidad de cupones / transacciones electrónicas
  totalAmount: Money;       // Monto total declarado en el cierre de lote
}

export interface PosVoucherBatchJSON {
  terminalId: string;
  batchNumber: string;
  paymentMethod: PaymentMethod;
  voucherCount: number;
  totalAmount: number;
}

export enum DiscrepancyStatus {
  EXACT = 'EXACT',       // Cuadre perfecto (diferencia = 0)
  SURPLUS = 'SURPLUS',   // Sobrante en caja (declarado > esperado)
  SHORTAGE = 'SHORTAGE', // Faltante en caja (declarado < esperado)
}

export interface MethodReconciliation {
  readonly method: PaymentMethod;
  readonly expected: Money;
  readonly declared: Money;
  readonly difference: Money;
  readonly status: DiscrepancyStatus;
  readonly voucherBatch?: PosVoucherBatch;
}

export interface CashReconciliationProps {
  shiftId: string;
  expectedCash: Money;
  declaredCash: Money;
  cashBreakdown?: CashBreakdown;
  methodSummaries?: MethodReconciliation[];
  posVoucherBatches?: PosVoucherBatch[];
  retainedFloatAmount?: Money; // Fondo fijo que permanece en gaveta para el próximo turno
  bankDepositAmount?: Money;   // Remesa que se envía a bóveda / banco
  notes?: string;
  reconciledAt?: Date;
  auditorId?: string;
  supervisorId?: string;
  signatureToken?: string;
  isBlindCount?: boolean;
}

export interface CashReconciliationJSON {
  shiftId: string;
  expectedCash: number;
  declaredCash: number;
  cashDifference: number;
  cashStatus: DiscrepancyStatus;
  currency: string;
  retainedFloatAmount?: number;
  bankDepositAmount?: number;
  cashBreakdown?: ReturnType<CashBreakdown['toJSON']>;
  posVoucherBatches?: PosVoucherBatchJSON[];
  methods: Array<{
    method: PaymentMethod;
    expected: number;
    declared: number;
    difference: number;
    status: DiscrepancyStatus;
  }>;
  notes?: string;
  reconciledAt: string;
  auditorId?: string;
  supervisorId?: string;
  signatureToken?: string;
  isBlindCount: boolean;
}

/**
 * Vista del arqueo apta para mostrarse al cajero en un conteo ciego: no revela el efectivo esperado
 * ni la diferencia/estado, solo lo que el propio cajero declaró.
 */
export interface BlindCashierView {
  shiftId: string;
  currency: string;
  declaredCash: number;
  declaredByMethod: Array<{ method: PaymentMethod; declared: number }>;
  cashBreakdown?: ReturnType<CashBreakdown['toJSON']>;
  posVoucherBatches?: PosVoucherBatchJSON[];
  notes?: string;
  reconciledAt: string;
  auditorId?: string;
  supervisorId?: string;
  isBlindCount: true;
}

/**
 * Entidad que encapsula el arqueo y conciliación de caja.
 * Permite arqueo ciego, sellado por supervisor, división de fondo retenido (Float) vs remesa bancaria,
 * y conciliación de lotes de vouchers POS.
 */
export class CashReconciliation {
  public readonly shiftId: string;
  public readonly expectedCash: Money;
  public readonly declaredCash: Money;
  public readonly cashDifference: Money;
  public readonly cashStatus: DiscrepancyStatus;
  public readonly cashBreakdown?: CashBreakdown;
  public readonly methodSummaries: MethodReconciliation[];
  public readonly posVoucherBatches: PosVoucherBatch[];
  public readonly retainedFloatAmount?: Money;
  public readonly bankDepositAmount?: Money;
  public readonly notes?: string;
  public readonly reconciledAt: Date;
  public readonly auditorId?: string;
  public readonly supervisorId?: string;
  public readonly signatureToken?: string;
  public readonly isBlindCount: boolean;

  public constructor(props: CashReconciliationProps) {
    this.shiftId = props.shiftId.trim();
    this.expectedCash = props.expectedCash;
    this.declaredCash = props.declaredCash;
    this.cashBreakdown = props.cashBreakdown;
    this.notes = props.notes?.trim();
    this.reconciledAt = props.reconciledAt || new Date();
    this.auditorId = props.auditorId?.trim();
    this.supervisorId = props.supervisorId?.trim();
    this.signatureToken = props.signatureToken?.trim();
    this.isBlindCount = props.isBlindCount ?? false;
    this.posVoucherBatches = props.posVoucherBatches || [];
    this.retainedFloatAmount = props.retainedFloatAmount;

    if (this.retainedFloatAmount) {
      if (this.retainedFloatAmount.isNegative()) {
        throw new InvalidMoneyAmountError(this.retainedFloatAmount.toDecimal(), 'El fondo retenido no puede ser negativo.');
      }
      if (this.retainedFloatAmount.greaterThan(props.declaredCash)) {
        throw new InvalidMoneyAmountError(
          this.retainedFloatAmount.toDecimal(),
          `El fondo retenido (${this.retainedFloatAmount.toString()}) no puede exceder el efectivo declarado (${props.declaredCash.toString()}).`
        );
      }
    }

    // Diferencia = Declarado - Esperado
    this.cashDifference = props.declaredCash.subtract(props.expectedCash);

    if (this.cashDifference.isZero()) {
      this.cashStatus = DiscrepancyStatus.EXACT;
    } else if (this.cashDifference.isPositive()) {
      this.cashStatus = DiscrepancyStatus.SURPLUS;
    } else {
      this.cashStatus = DiscrepancyStatus.SHORTAGE;
    }

    // Si se especificó fondo retenido (Float), el depósito al banco es declarado - retenido
    if (props.bankDepositAmount) {
      this.bankDepositAmount = props.bankDepositAmount;
    } else if (this.retainedFloatAmount) {
      if (this.declaredCash.greaterThanOrEqual(this.retainedFloatAmount)) {
        this.bankDepositAmount = this.declaredCash.subtract(this.retainedFloatAmount);
      } else {
        this.bankDepositAmount = Money.zero(this.declaredCash.currency);
      }
    } else {
      this.bankDepositAmount = this.declaredCash;
    }

    this.methodSummaries = props.methodSummaries || [
      {
        method: PaymentMethod.CASH,
        expected: this.expectedCash,
        declared: this.declaredCash,
        difference: this.cashDifference,
        status: this.cashStatus,
      },
    ];
  }

  /**
   * Reconstruye un arqueo desde su JSON (rehidratación).
   */
  public static fromJSON(json: CashReconciliationJSON): CashReconciliation {
    const currency = json.currency;
    const toMoney = (n: number) => Money.fromDecimal(n, currency);
    const posVoucherBatches: PosVoucherBatch[] | undefined = json.posVoucherBatches?.map((b) => ({
      terminalId: b.terminalId,
      batchNumber: b.batchNumber,
      paymentMethod: b.paymentMethod,
      voucherCount: b.voucherCount,
      totalAmount: toMoney(b.totalAmount),
    }));

    const rec = new CashReconciliation({
      shiftId: json.shiftId,
      expectedCash: toMoney(json.expectedCash),
      declaredCash: toMoney(json.declaredCash),
      cashBreakdown: json.cashBreakdown ? CashBreakdown.fromJSON(json.cashBreakdown) : undefined,
      methodSummaries: json.methods.map((m) => ({
        method: m.method,
        expected: toMoney(m.expected),
        declared: toMoney(m.declared),
        difference: toMoney(m.difference),
        status: m.status,
        voucherBatch: posVoucherBatches?.find((b) => b.paymentMethod === m.method),
      })),
      posVoucherBatches,
      retainedFloatAmount: json.retainedFloatAmount !== undefined ? toMoney(json.retainedFloatAmount) : undefined,
      bankDepositAmount: json.bankDepositAmount !== undefined ? toMoney(json.bankDepositAmount) : undefined,
      notes: json.notes,
      reconciledAt: new Date(json.reconciledAt),
      auditorId: json.auditorId,
      supervisorId: json.supervisorId,
      signatureToken: json.signatureToken,
      isBlindCount: json.isBlindCount,
    });
    return rec;
  }

  /**
   * Vista segura para el cajero: si el arqueo fue ciego devuelve únicamente lo declarado
   * (sin esperado ni diferencia); si no fue ciego devuelve el JSON completo.
   * La vista completa (`toJSON`) debe reservarse a supervisores/auditores.
   */
  public toCashierView(): BlindCashierView | CashReconciliationJSON {
    if (!this.isBlindCount) {
      return this.toJSON();
    }
    return {
      shiftId: this.shiftId,
      currency: this.expectedCash.currency,
      declaredCash: this.declaredCash.toDecimal(),
      declaredByMethod: this.methodSummaries.map((m) => ({ method: m.method, declared: m.declared.toDecimal() })),
      cashBreakdown: this.cashBreakdown?.toJSON(),
      posVoucherBatches: this.posVoucherBatches.map((v) => ({
        terminalId: v.terminalId,
        batchNumber: v.batchNumber,
        paymentMethod: v.paymentMethod,
        voucherCount: v.voucherCount,
        totalAmount: v.totalAmount.toDecimal(),
      })),
      notes: this.notes,
      reconciledAt: this.reconciledAt.toISOString(),
      auditorId: this.auditorId,
      supervisorId: this.supervisorId,
      isBlindCount: true,
    };
  }

  public toJSON(): CashReconciliationJSON {
    return {
      shiftId: this.shiftId,
      expectedCash: this.expectedCash.toDecimal(),
      declaredCash: this.declaredCash.toDecimal(),
      cashDifference: this.cashDifference.toDecimal(),
      cashStatus: this.cashStatus,
      currency: this.expectedCash.currency,
      retainedFloatAmount: this.retainedFloatAmount?.toDecimal(),
      bankDepositAmount: this.bankDepositAmount?.toDecimal(),
      cashBreakdown: this.cashBreakdown?.toJSON(),
      posVoucherBatches: this.posVoucherBatches.map((v) => ({
        terminalId: v.terminalId,
        batchNumber: v.batchNumber,
        paymentMethod: v.paymentMethod,
        voucherCount: v.voucherCount,
        totalAmount: v.totalAmount.toDecimal(),
      })),
      methods: this.methodSummaries.map((m) => ({
        method: m.method,
        expected: m.expected.toDecimal(),
        declared: m.declared.toDecimal(),
        difference: m.difference.toDecimal(),
        status: m.status,
      })),
      notes: this.notes,
      reconciledAt: this.reconciledAt.toISOString(),
      auditorId: this.auditorId,
      supervisorId: this.supervisorId,
      signatureToken: this.signatureToken,
      isBlindCount: this.isBlindCount,
    };
  }
}

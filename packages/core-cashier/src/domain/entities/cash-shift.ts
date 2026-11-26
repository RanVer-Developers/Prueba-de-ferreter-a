import { generateId } from '@modulos/core-shared';
import {
  CashierLockedError,
  CurrencyMismatchError,
  DuplicateTransactionError,
  InsufficientCashInDrawerError,
  InvalidCashierInputError,
  InvalidMoneyAmountError,
  InvalidPaymentError,
  InvalidShiftStatusError,
  InvalidVoidTargetError,
  MovementAlreadyVoidedError,
  MovementNotFoundError,
  SelfApprovalNotAllowedError,
  UnauthorizedVoidError,
} from '../errors/cashier-errors.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../services/authorization-policy.js';
import { CashBreakdown, CashBreakdownJSON, OptimalChangeResult } from '../value-objects/cash-denomination.js';
import { Money } from '../value-objects/money.js';
import { PaymentMethod } from '../value-objects/payment-method.js';
import { ShiftReportData } from './audit-report.js';
import { CashMovement, CashMovementJSON, ExpenseCategory, MovementType, UserSummary } from './cash-movement.js';
import {
  CashReconciliation,
  CashReconciliationJSON,
  DiscrepancyStatus,
  MethodReconciliation,
  PosVoucherBatch,
} from './cash-reconciliation.js';
import {
  CASHIER_SCHEMA_VERSION,
  CashShiftJSONInputSchema,
  CashShiftSnapshotSchema,
  parseWithCashierSchema,
} from '../../schemas/cashier.schemas.js';

const DEFAULT_VOID_POLICY = new SupervisorAuthorizationPolicy();

export enum ShiftStatus {
  OPEN = 'OPEN',
  SUSPENDED = 'SUSPENDED', // Pausa por descanso / colación / relevo temporal
  LOCKED = 'LOCKED',       // Bloqueo de seguridad de terminal
  CLOSED = 'CLOSED',       // Cierre definitivo de turno
}

export interface SuspensionRecord {
  readonly action: 'SUSPEND' | 'LOCK';
  readonly reason: string;
  readonly timestamp: Date;
  readonly authorizedBy?: UserSummary;
  resumedAt?: Date;
  resumedBy?: UserSummary;
}

export interface HandoverRecord {
  readonly outgoingCashier: UserSummary;
  readonly incomingCashier: UserSummary;
  readonly timestamp: Date;
  readonly intermediateReconciliation: CashReconciliation;
  readonly notes?: string;
}

export interface DrawerOpenRecord {
  readonly reason: string;
  readonly performedBy: UserSummary;
  readonly authorizedBy?: UserSummary;
  readonly timestamp: Date;
}

export interface DenominationExchangeRecord {
  readonly id: string;
  readonly amount: Money;
  readonly inBreakdown: CashBreakdown;
  readonly outBreakdown: CashBreakdown;
  readonly performedBy: UserSummary;
  readonly authorizedBy?: UserSummary;
  readonly reason?: string;
  readonly idempotencyKey?: string;
  readonly timestamp: Date;
}

export interface DenominationExchangeRecordSnapshot {
  id: string;
  amount: number;
  currency: string;
  inBreakdown: CashBreakdownJSON;
  outBreakdown: CashBreakdownJSON;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  reason?: string;
  idempotencyKey?: string;
  timestamp: string;
}

export interface EmployeeTipsSummary {
  serverEmployeeId?: string;
  serverName?: string;
  collected: Money;
  paidOut: Money;
  pending: Money;
}

export interface CashShiftProps {
  id: string;
  cashRegisterId: string;
  cashier: UserSummary;
  currency?: string;
  initialBalance: Money;
  initialBreakdown?: CashBreakdown;
  maxCashThreshold?: Money;
  openedAt?: Date;
  closedAt?: Date;
  status?: ShiftStatus;
  movements?: CashMovement[];
  reconciliation?: CashReconciliation;
  suspensionHistory?: SuspensionRecord[];
  handoverHistory?: HandoverRecord[];
  drawerOpenHistory?: DrawerOpenRecord[];
  denominationExchangeHistory?: DenominationExchangeRecord[];
  openingNotes?: string;
  closingNotes?: string;
  /** Existencia física actual en gaveta (si no se indica se parte de `initialBreakdown`). */
  drawerBreakdown?: CashBreakdown;
  /** Número de mutaciones aplicadas (control de concurrencia optimista). */
  version?: number;
  zReport?: ShiftReportData;
  xReportCount?: number;
}

export interface RecordTransactionOptions {
  allowNegativeCash?: boolean;
  /** Billetes/monedas que ingresan físicamente a la gaveta junto con la transacción. */
  drawerAdded?: CashBreakdown;
  /** Billetes/monedas que salen físicamente de la gaveta (cambio entregado). */
  drawerDeducted?: CashBreakdown;
}

export interface SuspensionRecordSnapshot {
  action: 'SUSPEND' | 'LOCK';
  reason: string;
  timestamp: string;
  authorizedBy?: UserSummary;
  resumedAt?: string;
  resumedBy?: UserSummary;
}

export interface HandoverRecordSnapshot {
  outgoingCashier: UserSummary;
  incomingCashier: UserSummary;
  timestamp: string;
  intermediateReconciliation: CashReconciliationJSON;
  notes?: string;
}

export interface DrawerOpenRecordSnapshot {
  reason: string;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  timestamp: string;
}

/**
 * Representación serializable y completa del turno (lossless) para persistencia y sincronización offline.
 * `CashShift.fromSnapshot(shift.toSnapshot())` reproduce exactamente el mismo estado.
 */
export interface CashShiftSnapshot {
  schemaVersion: typeof CASHIER_SCHEMA_VERSION;
  id: string;
  cashRegisterId: string;
  cashier: UserSummary;
  currency: string;
  status: ShiftStatus;
  initialBalance: number;
  initialBreakdown?: CashBreakdownJSON;
  drawerBreakdown: CashBreakdownJSON;
  maxCashThreshold?: number;
  openedAt: string;
  closedAt?: string;
  movements: CashMovementJSON[];
  suspensionHistory: SuspensionRecordSnapshot[];
  handoverHistory: HandoverRecordSnapshot[];
  drawerOpenHistory?: DrawerOpenRecordSnapshot[];
  denominationExchangeHistory?: DenominationExchangeRecordSnapshot[];
  reconciliation?: CashReconciliationJSON;
  zReport?: ShiftReportData;
  xReportCount: number;
  openingNotes?: string;
  closingNotes?: string;
  version: number;
}

export interface ShiftFinancialSummary {
  currency: string;
  initialBalance: Money;
  totalSales: Money;
  totalRefunds: Money;
  totalDeposits: Money;
  totalWithdrawals: Money;
  totalSafeDrops: Money;
  totalTipsCollected: Money;
  totalTipsPaidOut: Money;
  unpaidTipsBalance: Money;
  totalVoidedAmount: Money;
  currentCashInDrawer: Money;
  isCashLimitExceeded: boolean;
  maxCashThreshold?: Money;
  totalsByMethod: Record<PaymentMethod, {
    in: Money;
    out: Money;
    net: Money;
  }>;
  expensesByCategory: Record<ExpenseCategory, Money>;
}

export interface CashShiftJSON {
  schemaVersion?: number;
  id: string;
  cashRegisterId: string;
  cashier: UserSummary;
  currency: string;
  status: ShiftStatus;
  initialBalance: number;
  initialBreakdown?: ReturnType<CashBreakdown['toJSON']>;
  drawerBreakdown: ReturnType<CashBreakdown['toJSON']>;
  maxCashThreshold?: number;
  isCashLimitExceeded: boolean;
  openedAt: string;
  closedAt?: string;
  expectedCash: number;
  movementsCount: number;
  suspensionsCount: number;
  handoversCount: number;
  drawerOpeningsCount: number;
  denominationExchangesCount: number;
  movements: CashMovementJSON[];
  suspensionHistory: SuspensionRecordSnapshot[];
  handoverHistory: HandoverRecordSnapshot[];
  drawerOpenHistory: DrawerOpenRecordSnapshot[];
  denominationExchangeHistory: DenominationExchangeRecordSnapshot[];
  summary: {
    totalSales: number;
    totalRefunds: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalSafeDrops: number;
    totalTipsCollected: number;
    totalTipsPaidOut: number;
    unpaidTipsBalance: number;
    totalVoidedAmount: number;
    currentCashInDrawer: number;
  };
  reconciliation?: ReturnType<CashReconciliation['toJSON']>;
  zReport?: ShiftReportData;
  xReportCount: number;
  version: number;
  openingNotes?: string;
  closingNotes?: string;
}

/**
 * Agregado principal: Turno o Sesión de Caja.
 * Controla el ciclo de vida, soporte offline, desglose físico,
 * propinas, gastos categorizados, anulaciones auditadas y relevos de cajero.
 */
export class CashShift {
  public readonly id: string;
  public readonly cashRegisterId: string;
  private _cashier: UserSummary;
  public readonly currency: string;
  public readonly initialBalance: Money;
  public readonly initialBreakdown?: CashBreakdown;
  public readonly maxCashThreshold?: Money;
  public readonly openedAt: Date;
  public closedAt?: Date;
  private _status: ShiftStatus;
  private readonly _movements: CashMovement[];
  private readonly _processedIdempotencyKeys: Set<string>;
  private _nextSequenceNumber: number;
  private _drawerBreakdown: CashBreakdown;
  private readonly _suspensionHistory: SuspensionRecord[];
  private readonly _handoverHistory: HandoverRecord[];
  private readonly _drawerOpenHistory: DrawerOpenRecord[];
  private readonly _denominationExchangeHistory: DenominationExchangeRecord[];
  private _reconciliation?: CashReconciliation;
  private _zReport?: ShiftReportData;
  private _xReportCount: number;
  private _version: number;
  private _persistedVersion: number;
  public openingNotes?: string;
  public closingNotes?: string;

  public constructor(props: CashShiftProps) {
    this.currency = (props.currency || props.initialBalance.currency || 'USD').toUpperCase().trim();

    if (props.initialBalance.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, props.initialBalance.currency);
    }
    if (props.initialBalance.isNegative()) {
      throw new InvalidMoneyAmountError(props.initialBalance.toDecimal(), 'El monto inicial de apertura no puede ser negativo.');
    }

    if (props.maxCashThreshold && props.maxCashThreshold.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, props.maxCashThreshold.currency);
    }

    this.id = props.id.trim();
    this.cashRegisterId = props.cashRegisterId.trim();
    this._cashier = props.cashier;
    this.initialBalance = props.initialBalance;
    this.initialBreakdown = props.initialBreakdown;
    this.maxCashThreshold = props.maxCashThreshold;
    this.openedAt = props.openedAt || new Date();
    this.closedAt = props.closedAt;
    this._status = props.status || ShiftStatus.OPEN;
    this._movements = [];
    this._processedIdempotencyKeys = new Set();
    this._suspensionHistory = props.suspensionHistory ? [...props.suspensionHistory] : [];
    this._handoverHistory = props.handoverHistory ? [...props.handoverHistory] : [];
    this._drawerOpenHistory = props.drawerOpenHistory ? [...props.drawerOpenHistory] : [];
    this._denominationExchangeHistory = props.denominationExchangeHistory ? [...props.denominationExchangeHistory] : [];
    this._reconciliation = props.reconciliation;
    this.openingNotes = props.openingNotes?.trim();
    this.closingNotes = props.closingNotes?.trim();

    this._zReport = props.zReport;
    this._xReportCount = props.xReportCount ?? 0;
    this._version = props.version ?? 0;
    this._persistedVersion = this._version;

    if (props.drawerBreakdown) {
      this._drawerBreakdown = props.drawerBreakdown;
    } else if (props.initialBreakdown) {
      this._drawerBreakdown = new CashBreakdown(
        Object.fromEntries(props.initialBreakdown.getItems().map((i) => [i.denomination, i.count])),
        this.currency
      );
    } else {
      this._drawerBreakdown = CashBreakdown.empty(this.currency);
    }

    let maxSeq = 0;
    if (props.movements) {
      for (const m of props.movements) {
        this._movements.push(m);
        if (m.idempotencyKey) {
          this._processedIdempotencyKeys.add(m.idempotencyKey);
        }
        if (m.sequenceNumber && m.sequenceNumber > maxSeq) {
          maxSeq = m.sequenceNumber;
        }
      }
    }
    this._nextSequenceNumber = maxSeq + 1;
  }

  public get cashier(): UserSummary {
    return this._cashier;
  }

  public get status(): ShiftStatus {
    return this._status;
  }

  public get movements(): ReadonlyArray<CashMovement> {
    return [...this._movements];
  }

  public get drawerBreakdown(): CashBreakdown {
    return this._drawerBreakdown;
  }

  public get suspensionHistory(): ReadonlyArray<SuspensionRecord> {
    return [...this._suspensionHistory];
  }

  public get handoverHistory(): ReadonlyArray<HandoverRecord> {
    return [...this._handoverHistory];
  }

  public get drawerOpenHistory(): ReadonlyArray<DrawerOpenRecord> {
    return [...this._drawerOpenHistory];
  }

  public get denominationExchangeHistory(): ReadonlyArray<DenominationExchangeRecord> {
    return [...this._denominationExchangeHistory];
  }

  public get reconciliation(): CashReconciliation | undefined {
    return this._reconciliation;
  }

  /** Reporte Z congelado (inmutable una vez emitido). */
  public get zReport(): ShiftReportData | undefined {
    return this._zReport;
  }

  /** Versión actual (nº de mutaciones). Se usa para bloqueo optimista en los repositorios. */
  public get version(): number {
    return this._version;
  }

  /** Versión que tenía el turno cuando se cargó/guardó por última vez en el repositorio. */
  public get persistedVersion(): number {
    return this._persistedVersion;
  }

  /** Lo invoca el repositorio tras persistir con éxito. */
  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  private touch(): void {
    this._version += 1;
  }

  public findMovementById(movementId: string): CashMovement | undefined {
    return this._movements.find((m) => m.id === movementId);
  }

  public findMovementByIdempotencyKey(idempotencyKey: string): CashMovement | undefined {
    return this._movements.find((m) => m.idempotencyKey === idempotencyKey);
  }

  /**
   * Movimientos generados por una misma transacción idempotente (clave raíz + sufijos `-nc-N`, `-cash`, `-tip`).
   */
  public findMovementsByIdempotencyRoot(rootKey: string): CashMovement[] {
    const suffix = /^(?:-nc-\d+|-cash|-tip)$/;
    return this._movements.filter(
      (m) => !!m.idempotencyKey && (m.idempotencyKey === rootKey || (m.idempotencyKey.startsWith(rootKey) && suffix.test(m.idempotencyKey.slice(rootKey.length))))
    );
  }

  public findMovementsByReferenceId(referenceId: string): CashMovement[] {
    return this._movements.filter((m) => m.referenceId === referenceId);
  }

  public isOpen(): boolean {
    return this._status === ShiftStatus.OPEN;
  }

  public isSuspended(): boolean {
    return this._status === ShiftStatus.SUSPENDED;
  }

  public isLocked(): boolean {
    return this._status === ShiftStatus.LOCKED;
  }

  public isClosed(): boolean {
    return this._status === ShiftStatus.CLOSED;
  }

  public isCashLimitExceeded(): boolean {
    if (!this.maxCashThreshold) return false;
    return this.calculateExpectedCash().greaterThan(this.maxCashThreshold);
  }

  public calculateExpectedCash(): Money {
    let runningCash = this.initialBalance;

    for (const mov of this._movements) {
      if (mov.isVoided) continue; // El original anulado y su VOID se neutralizan mutuamente
      if (mov.isCashIn()) {
        runningCash = runningCash.add(mov.amount);
      } else if (mov.isCashOut()) {
        runningCash = runningCash.subtract(mov.amount);
      }
    }

    return runningCash;
  }

  public calculateOptimalChange(changeAmount: Money | number): OptimalChangeResult {
    const money = typeof changeAmount === 'number'
      ? Money.fromDecimal(changeAmount, this.currency)
      : changeAmount;
    return this._drawerBreakdown.calculateOptimalChange(money);
  }

  public updateDrawerStock(added?: CashBreakdown, deducted?: CashBreakdown): void {
    let next = this._drawerBreakdown;
    if (added) {
      next = next.add(added);
    }
    if (deducted) {
      next = next.subtract(deducted);
    }
    this._drawerBreakdown = next;
    this.touch();
  }

  /**
   * Verifica que el turno esté en un estado que permita registrar movimientos.
   */
  public assertOperational(): void {
    if (this._status === ShiftStatus.SUSPENDED) {
      throw new CashierLockedError(this.id, 'El turno se encuentra suspendido temporalmente.');
    }
    if (this._status === ShiftStatus.LOCKED) {
      throw new CashierLockedError(this.id, 'La terminal de caja se encuentra bloqueada por seguridad.');
    }
    if (this._status !== ShiftStatus.OPEN) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.OPEN);
    }
  }

  /**
   * Registra un lote de movimientos (y el cambio físico de gaveta asociado) de forma ATÓMICA:
   * todo se valida primero —estado, moneda, claves idempotentes, efectivo suficiente, stock de billetes—
   * y solo si todo es válido se aplica. Si algo falla, el turno queda intacto.
   */
  public recordTransaction(movements: CashMovement[], options: RecordTransactionOptions = {}): CashMovement[] {
    this.assertOperational();

    if (movements.length === 0) {
      return [];
    }

    const batchKeys = new Set<string>();
    let runningCash = this.calculateExpectedCash();

    for (const movement of movements) {
      if (movement.shiftId !== this.id) {
        throw new InvalidPaymentError(
          `El movimiento "${movement.id}" pertenece al turno "${movement.shiftId}" y no puede registrarse en el turno "${this.id}".`
        );
      }

      if (movement.amount.currency !== this.currency) {
        throw new CurrencyMismatchError(this.currency, movement.amount.currency);
      }

      if (movement.idempotencyKey) {
        if (this._processedIdempotencyKeys.has(movement.idempotencyKey) || batchKeys.has(movement.idempotencyKey)) {
          throw new DuplicateTransactionError(movement.idempotencyKey);
        }
        batchKeys.add(movement.idempotencyKey);
      }

      if (movement.isCashOut()) {
        if (!options.allowNegativeCash && movement.amount.greaterThan(runningCash)) {
          throw new InsufficientCashInDrawerError(
            movement.amount.toDecimal(),
            runningCash.toDecimal(),
            this.currency
          );
        }
        runningCash = runningCash.subtract(movement.amount);
      } else if (movement.isCashIn()) {
        runningCash = runningCash.add(movement.amount);
      }
    }

    // Calcular la nueva existencia física ANTES de mutar nada (puede lanzar si faltan billetes)
    let nextDrawer = this._drawerBreakdown;
    if (options.drawerAdded) {
      nextDrawer = nextDrawer.add(options.drawerAdded);
    }
    if (options.drawerDeducted) {
      nextDrawer = nextDrawer.subtract(options.drawerDeducted);
    }

    // Commit
    const finalized: CashMovement[] = [];
    for (const movement of movements) {
      let toStore = movement;
      if (movement.sequenceNumber === undefined) {
        toStore = movement.with({ sequenceNumber: this._nextSequenceNumber++ });
      } else if (movement.sequenceNumber >= this._nextSequenceNumber) {
        this._nextSequenceNumber = movement.sequenceNumber + 1;
      }

      if (toStore.idempotencyKey) {
        this._processedIdempotencyKeys.add(toStore.idempotencyKey);
      }
      this._movements.push(toStore);
      finalized.push(toStore);
    }

    this._drawerBreakdown = nextDrawer;
    this.touch();
    return finalized;
  }

  public recordMovement(movement: CashMovement, allowNegativeCash = false): CashMovement {
    return this.recordTransaction([movement], { allowNegativeCash })[0];
  }

  /**
   * Anula un movimiento previo exigiendo autorización obligatoria de un supervisor distinto del operador.
   * El original queda marcado como anulado y se registra un movimiento VOID de auditoría; ambos se
   * neutralizan en los saldos (sin importar el método de pago).
   */
  public voidMovement(
    movementId: string,
    reason: string,
    authorizedBy: UserSummary,
    voidMovementId?: string,
    authorizationPolicy: IAuthorizationPolicy = DEFAULT_VOID_POLICY
  ): CashMovement {
    if (!authorizedBy || !authorizedBy.id || authorizedBy.id.trim().length === 0) {
      throw new UnauthorizedVoidError(movementId, 'Debe especificar el supervisor que aprueba la anulación.');
    }

    const original = this._movements.find((m) => m.id === movementId);
    if (!original) {
      throw new MovementNotFoundError(movementId, this.id);
    }

    if (original.isVoided) {
      throw new MovementAlreadyVoidedError(movementId);
    }

    if (original.type === MovementType.VOID) {
      throw new InvalidVoidTargetError(movementId, 'un movimiento de anulación no puede anularse.');
    }

    authorizationPolicy.assertCanAuthorize('VOID', authorizedBy, original.performedBy);
    if (authorizedBy.id === this._cashier.id) {
      throw new SelfApprovalNotAllowedError(authorizedBy.id, 'VOID');
    }

    if (!reason || reason.trim().length === 0) {
      throw new UnauthorizedVoidError(movementId, 'Debe indicar el motivo de la anulación.');
    }

    if (original.type === MovementType.TIP) {
      const empId = original.tipDetails?.serverEmployeeId;
      const pending = this.getUnpaidTipsForEmployee(empId);
      if (original.amount.greaterThan(pending)) {
        throw new InvalidMoneyAmountError(
          original.amount.toDecimal(),
          `No se puede anular la propina '${original.id}' porque ya fue liquidada total o parcialmente.`
        );
      }
    }

    // Crear el movimiento de anulación compensatoria
    const voidMov = new CashMovement({
      id: voidMovementId || generateId('void'),
      shiftId: this.id,
      type: MovementType.VOID,
      amount: original.amount,
      paymentMethod: original.paymentMethod,
      concept: `Anulación: ${reason.trim()} (Ref: ${movementId})`,
      referenceId: original.referenceId,
      performedBy: this._cashier,
      voidDetails: {
        voidedMovementId: movementId,
        reason: reason.trim(),
        authorizedBy,
        authorizedAt: new Date(),
      },
    });

    // Registrar primero (valida estado/duplicados); solo si tiene éxito se marca el original
    const recorded = this.recordTransaction([voidMov], { allowNegativeCash: true })[0];
    original.markAsVoided();
    return recorded;
  }

  /**
   * Anula atómicamente todos los movimientos activos asociados a una misma referencia de transacción
   * (ej. pagos mixtos tarjeta + efectivo + propina).
   */
  public voidTransactionByReference(
    referenceId: string,
    reason: string,
    authorizedBy: UserSummary,
    voidIdPrefix?: string,
    authorizationPolicy: IAuthorizationPolicy = DEFAULT_VOID_POLICY
  ): CashMovement[] {
    if (!authorizedBy || !authorizedBy.id || authorizedBy.id.trim().length === 0) {
      throw new UnauthorizedVoidError(referenceId, 'Debe especificar el supervisor que aprueba la anulación.');
    }
    if (!reason || reason.trim().length === 0) {
      throw new UnauthorizedVoidError(referenceId, 'Debe indicar el motivo de la anulación.');
    }

    const targets = this._movements.filter(
      (m) => m.referenceId === referenceId && !m.isVoided && m.type !== MovementType.VOID
    );
    if (targets.length === 0) {
      throw new MovementNotFoundError(referenceId, this.id);
    }

    for (const orig of targets) {
      authorizationPolicy.assertCanAuthorize('VOID', authorizedBy, orig.performedBy);
      if (authorizedBy.id === this._cashier.id) {
        throw new SelfApprovalNotAllowedError(authorizedBy.id, 'VOID');
      }
      if (orig.type === MovementType.TIP) {
        const empId = orig.tipDetails?.serverEmployeeId;
        const pending = this.getUnpaidTipsForEmployee(empId);
        if (orig.amount.greaterThan(pending)) {
          throw new InvalidMoneyAmountError(
            orig.amount.toDecimal(),
            `No se puede anular la transacción '${referenceId}' porque su propina ya fue liquidada total o parcialmente.`
          );
        }
      }
    }

    const now = new Date();
    const voidMovements = targets.map((orig, idx) =>
      new CashMovement({
        id: voidIdPrefix ? `${voidIdPrefix}-${idx}` : generateId('void'),
        shiftId: this.id,
        type: MovementType.VOID,
        amount: orig.amount,
        paymentMethod: orig.paymentMethod,
        concept: `Anulación: ${reason.trim()} (Ref: ${orig.id})`,
        referenceId: orig.referenceId,
        performedBy: this._cashier,
        idempotencyKey: voidIdPrefix ? `${voidIdPrefix}-idemp-${idx}` : undefined,
        voidDetails: {
          voidedMovementId: orig.id,
          reason: reason.trim(),
          authorizedBy,
          authorizedAt: now,
        },
      })
    );

    const recorded = this.recordTransaction(voidMovements, { allowNegativeCash: true });
    for (const orig of targets) {
      orig.markAsVoided();
    }
    return recorded;
  }

  /**
   * Cambio de denominaciones en gaveta ("feria" / bill break) sin alterar el saldo contable total.
   * Valida que el total entrante y saliente coincidan y que existan las piezas salientes en gaveta.
   */
  public exchangeDenominations(
    id: string,
    inBreakdown: CashBreakdown,
    outBreakdown: CashBreakdown,
    performedBy: UserSummary,
    reason?: string,
    authorizedBy?: UserSummary,
    idempotencyKey?: string
  ): DenominationExchangeRecord {
    this.assertOperational();

    if (idempotencyKey) {
      const existing = this._denominationExchangeHistory.find((r) => r.idempotencyKey === idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    if (inBreakdown.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, inBreakdown.currency);
    }
    if (outBreakdown.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, outBreakdown.currency);
    }

    const inTotal = inBreakdown.calculateTotal();
    const outTotal = outBreakdown.calculateTotal();

    if (!inTotal.isPositive()) {
      throw new InvalidMoneyAmountError(inTotal.toDecimal(), 'El monto del cambio de denominaciones debe ser positivo.');
    }
    if (!inTotal.equals(outTotal)) {
      throw new InvalidMoneyAmountError(
        outTotal.toDecimal(),
        `El total entregado (${outTotal.toString()}) debe ser exactamente igual al recibido (${inTotal.toString()}).`
      );
    }

    // Primero restar lo que sale de gaveta (lanza si no hay stock suficiente de esas denominaciones)
    const afterOut = this._drawerBreakdown.subtract(outBreakdown);
    const nextDrawer = afterOut.add(inBreakdown);

    const record: DenominationExchangeRecord = {
      id: id.trim(),
      amount: inTotal,
      inBreakdown,
      outBreakdown,
      performedBy,
      authorizedBy,
      reason: reason?.trim(),
      idempotencyKey: idempotencyKey?.trim(),
      timestamp: new Date(),
    };

    this._drawerBreakdown = nextDrawer;
    this._denominationExchangeHistory.push(record);
    this.touch();
    return record;
  }

  /**
   * Calcula las propinas recaudadas, liquidadas y pendientes agrupadas por empleado.
   */
  public getUnpaidTipsByEmployee(): EmployeeTipsSummary[] {
    const map = new Map<string, { serverEmployeeId?: string; serverName?: string; collected: Money; paidOut: Money }>();

    for (const m of this._movements) {
      if (m.isVoided) continue;
      if (m.type !== MovementType.TIP && m.type !== MovementType.TIP_PAYOUT) continue;

      const empId = m.tipDetails?.serverEmployeeId;
      const key = empId ?? '__UNASSIGNED__';
      let entry = map.get(key);
      if (!entry) {
        entry = {
          serverEmployeeId: empId,
          serverName: m.tipDetails?.serverName,
          collected: Money.zero(this.currency),
          paidOut: Money.zero(this.currency),
        };
        map.set(key, entry);
      } else if (!entry.serverName && m.tipDetails?.serverName) {
        entry.serverName = m.tipDetails.serverName;
      }

      if (m.type === MovementType.TIP) {
        entry.collected = entry.collected.add(m.amount);
      } else {
        entry.paidOut = entry.paidOut.add(m.amount);
      }
    }

    return Array.from(map.values()).map((e) => ({
      serverEmployeeId: e.serverEmployeeId,
      serverName: e.serverName,
      collected: e.collected,
      paidOut: e.paidOut,
      pending: e.collected.subtract(e.paidOut),
    }));
  }

  /**
   * Devuelve el saldo de propinas pendiente de liquidar para un empleado específico
   * (o el saldo global del turno si no se especifica `serverEmployeeId`).
   */
  public getUnpaidTipsForEmployee(serverEmployeeId?: string): Money {
    if (!serverEmployeeId) {
      return this.calculateSummary().unpaidTipsBalance;
    }
    const found = this.getUnpaidTipsByEmployee().find((e) => e.serverEmployeeId === serverEmployeeId);
    return found ? found.pending : Money.zero(this.currency);
  }

  /**
   * Realiza el traspaso de turno (Handover) entre cajeros en la misma sesión continua.
   */
  public handover(
    incomingCashier: UserSummary,
    intermediateReconciliation: CashReconciliation,
    notes?: string
  ): void {
    if (this._status !== ShiftStatus.OPEN && this._status !== ShiftStatus.SUSPENDED) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.OPEN);
    }

    const record: HandoverRecord = {
      outgoingCashier: this._cashier,
      incomingCashier,
      timestamp: new Date(),
      intermediateReconciliation,
      notes: notes?.trim(),
    };

    this._handoverHistory.push(record);
    this._cashier = incomingCashier;
    this._status = ShiftStatus.OPEN;
    this.touch();
  }

  public suspend(reason = 'Pausa de turno', authorizedBy?: UserSummary): void {
    if (this._status !== ShiftStatus.OPEN) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.OPEN);
    }

    this._status = ShiftStatus.SUSPENDED;
    this._suspensionHistory.push({
      action: 'SUSPEND',
      reason: (reason || 'Pausa de turno').trim(),
      timestamp: new Date(),
      authorizedBy,
    });
    this.touch();
  }

  public resume(authorizedBy?: UserSummary): void {
    if (this._status !== ShiftStatus.SUSPENDED) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.SUSPENDED);
    }

    this._status = ShiftStatus.OPEN;
    const lastRecord = this._suspensionHistory[this._suspensionHistory.length - 1];
    if (lastRecord && lastRecord.action === 'SUSPEND' && !lastRecord.resumedAt) {
      lastRecord.resumedAt = new Date();
      lastRecord.resumedBy = authorizedBy;
    }
    this.touch();
  }

  public lock(reason = 'Bloqueo de terminal'): void {
    if (this._status !== ShiftStatus.OPEN) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.OPEN);
    }

    this._status = ShiftStatus.LOCKED;
    this._suspensionHistory.push({
      action: 'LOCK',
      reason: (reason || 'Bloqueo de terminal').trim(),
      timestamp: new Date(),
    });
    this.touch();
  }

  public unlock(authorizedBy?: UserSummary): void {
    if (this._status !== ShiftStatus.LOCKED) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.LOCKED);
    }

    this._status = ShiftStatus.OPEN;
    const lastRecord = this._suspensionHistory[this._suspensionHistory.length - 1];
    if (lastRecord && lastRecord.action === 'LOCK' && !lastRecord.resumedAt) {
      lastRecord.resumedAt = new Date();
      lastRecord.resumedBy = authorizedBy;
    }
    this.touch();
  }

  /**
   * Registra una apertura de cajón sin venta con motivo y trazabilidad de usuario/supervisor.
   */
  public recordDrawerOpen(
    reason: string,
    performedBy: UserSummary,
    authorizedBy?: UserSummary
  ): DrawerOpenRecord {
    this.assertOperational();
    if (!reason || reason.trim().length === 0) {
      throw new InvalidCashierInputError('El motivo de la apertura de cajón sin venta es obligatorio.');
    }
    const record: DrawerOpenRecord = {
      reason: reason.trim(),
      performedBy,
      authorizedBy,
      timestamp: new Date(),
    };
    this._drawerOpenHistory.push(record);
    this.touch();
    return record;
  }

  public calculateSummary(): ShiftFinancialSummary {
    let totalSales = Money.zero(this.currency);
    let totalRefunds = Money.zero(this.currency);
    let totalDeposits = Money.zero(this.currency);
    let totalWithdrawals = Money.zero(this.currency);
    let totalSafeDrops = Money.zero(this.currency);
    let totalTipsCollected = Money.zero(this.currency);
    let totalTipsPaidOut = Money.zero(this.currency);
    let totalVoidedAmount = Money.zero(this.currency);

    const methodsMap = new Map<PaymentMethod, { in: Money; out: Money }>();
    const expensesByCategory: Record<ExpenseCategory, Money> = {
      [ExpenseCategory.CLEANING_SUPPLIES]: Money.zero(this.currency),
      [ExpenseCategory.COURIER_SHIPPING]: Money.zero(this.currency),
      [ExpenseCategory.STORE_SUPPLIES]: Money.zero(this.currency),
      [ExpenseCategory.EMERGENCY_PURCHASE]: Money.zero(this.currency),
      [ExpenseCategory.STAFF_ADVANCE]: Money.zero(this.currency),
      [ExpenseCategory.UTILITIES_SERVICES]: Money.zero(this.currency),
      [ExpenseCategory.OTHER]: Money.zero(this.currency),
    };

    for (const method of Object.values(PaymentMethod)) {
      methodsMap.set(method, { in: Money.zero(this.currency), out: Money.zero(this.currency) });
    }

    for (const mov of this._movements) {
      if (mov.isVoided) {
        // El original anulado no cuenta en ventas/métodos; el VOID asociado tampoco (se neutralizan)
        totalVoidedAmount = totalVoidedAmount.add(mov.amount);
        continue;
      }

      const entry = methodsMap.get(mov.paymentMethod)!;

      switch (mov.type) {
        case MovementType.SALE:
          totalSales = totalSales.add(mov.amount);
          entry.in = entry.in.add(mov.amount);
          break;
        case MovementType.REFUND:
          totalRefunds = totalRefunds.add(mov.amount);
          entry.out = entry.out.add(mov.amount);
          break;
        case MovementType.TIP:
          totalTipsCollected = totalTipsCollected.add(mov.amount);
          entry.in = entry.in.add(mov.amount);
          break;
        case MovementType.TIP_PAYOUT:
          totalTipsPaidOut = totalTipsPaidOut.add(mov.amount);
          entry.out = entry.out.add(mov.amount);
          break;
        case MovementType.MANUAL_DEPOSIT:
          totalDeposits = totalDeposits.add(mov.amount);
          entry.in = entry.in.add(mov.amount);
          break;
        case MovementType.MANUAL_WITHDRAWAL:
          totalWithdrawals = totalWithdrawals.add(mov.amount);
          entry.out = entry.out.add(mov.amount);
          if (mov.expenseDetails) {
            expensesByCategory[mov.expenseDetails.category] =
              expensesByCategory[mov.expenseDetails.category].add(mov.amount);
          } else {
            expensesByCategory[ExpenseCategory.OTHER] =
              expensesByCategory[ExpenseCategory.OTHER].add(mov.amount);
          }
          break;
        case MovementType.SAFE_DROP:
          totalSafeDrops = totalSafeDrops.add(mov.amount);
          entry.out = entry.out.add(mov.amount);
          break;
        case MovementType.VOID:
          // Marcador de auditoría: no mueve saldos (el original ya fue excluido)
          break;
        case MovementType.ADJUSTMENT:
          if (mov.adjustmentDirection === 'OUT') {
            entry.out = entry.out.add(mov.amount);
          } else {
            entry.in = entry.in.add(mov.amount);
          }
          break;
      }
    }

    const totalsByMethod = {} as ShiftFinancialSummary['totalsByMethod'];
    for (const [method, { in: inAmount, out: outAmount }] of methodsMap.entries()) {
      totalsByMethod[method] = {
        in: inAmount,
        out: outAmount,
        net: inAmount.subtract(outAmount),
      };
    }

    const currentCashInDrawer = this.calculateExpectedCash();

    return {
      currency: this.currency,
      initialBalance: this.initialBalance,
      totalSales,
      totalRefunds,
      totalDeposits,
      totalWithdrawals,
      totalSafeDrops,
      totalTipsCollected,
      totalTipsPaidOut,
      unpaidTipsBalance: totalTipsCollected.subtract(totalTipsPaidOut),
      totalVoidedAmount,
      currentCashInDrawer,
      isCashLimitExceeded: this.maxCashThreshold ? currentCashInDrawer.greaterThan(this.maxCashThreshold) : false,
      maxCashThreshold: this.maxCashThreshold,
      totalsByMethod,
      expensesByCategory,
    };
  }

  public generateReconciliation(
    declaredAmounts: Map<PaymentMethod, Money> | { cash: Money },
    cashBreakdown?: CashBreakdown,
    auditorId?: string,
    notes?: string,
    supervisorId?: string,
    signatureToken?: string,
    isBlindCount = false,
    posVoucherBatches?: PosVoucherBatch[],
    retainedFloatAmount?: Money
  ): CashReconciliation {
    const summary = this.calculateSummary();
    const declaredCash = declaredAmounts instanceof Map
      ? declaredAmounts.get(PaymentMethod.CASH) || (cashBreakdown ? cashBreakdown.calculateTotal() : Money.zero(this.currency))
      : declaredAmounts.cash;

    const methodSummaries: MethodReconciliation[] = [];

    for (const method of Object.values(PaymentMethod)) {
      const expected = method === PaymentMethod.CASH
        ? summary.currentCashInDrawer
        : summary.totalsByMethod[method].net;

      const matchingBatches = posVoucherBatches?.filter((v) => v.paymentMethod === method) ?? [];
      const voucherBatch = matchingBatches[0];
      const batchesTotal = matchingBatches.length > 0
        ? matchingBatches.reduce((acc, b) => acc.add(b.totalAmount), Money.zero(this.currency))
        : undefined;

      const declared = batchesTotal
        ? batchesTotal
        : declaredAmounts instanceof Map && declaredAmounts.has(method)
          ? declaredAmounts.get(method)!
          : method === PaymentMethod.CASH
            ? declaredCash
            : expected;

      const diff = declared.subtract(expected);
      const status: DiscrepancyStatus = diff.isZero()
        ? DiscrepancyStatus.EXACT
        : diff.isPositive()
          ? DiscrepancyStatus.SURPLUS
          : DiscrepancyStatus.SHORTAGE;

      methodSummaries.push({
        method,
        expected,
        declared,
        difference: diff,
        status,
        voucherBatch,
      });
    }

    return new CashReconciliation({
      shiftId: this.id,
      expectedCash: summary.currentCashInDrawer,
      declaredCash,
      cashBreakdown,
      methodSummaries,
      posVoucherBatches,
      retainedFloatAmount,
      notes,
      auditorId,
      supervisorId,
      signatureToken,
      isBlindCount,
    });
  }

  /**
   * Cierra el turno desde estado OPEN, SUSPENDED o LOCKED (evitando que una terminal bloqueada
   * deje la caja atascada). Si se pasa `authorizedBy`, no puede ser el mismo cajero y queda
   * registrado como quien levantó el bloqueo/suspensión al cierre.
   */
  public close(reconciliation: CashReconciliation, closingNotes?: string, authorizedBy?: UserSummary): void {
    if (this._status === ShiftStatus.CLOSED) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.OPEN);
    }

    if (authorizedBy && authorizedBy.id === this._cashier.id) {
      throw new SelfApprovalNotAllowedError(authorizedBy.id, 'FORCE_CLOSE_LOCKED');
    }

    if (this._status === ShiftStatus.LOCKED || this._status === ShiftStatus.SUSPENDED) {
      const lastRecord = this._suspensionHistory[this._suspensionHistory.length - 1];
      if (lastRecord && !lastRecord.resumedAt) {
        lastRecord.resumedAt = new Date();
        lastRecord.resumedBy = authorizedBy;
      }
    }

    this._reconciliation = reconciliation;
    this.closingNotes = closingNotes?.trim() || reconciliation.notes;
    this.closedAt = new Date();
    this._status = ShiftStatus.CLOSED;
    this.touch();
  }

  /**
   * Número consecutivo del próximo reporte X de este turno.
   */
  public nextXReportNumber(): number {
    this._xReportCount += 1;
    this.touch();
    return this._xReportCount;
  }

  /**
   * Congela el reporte Z del turno. Solo se puede emitir una vez y con el turno cerrado.
   */
  public sealZReport(report: ShiftReportData): void {
    if (!this.isClosed()) {
      throw new InvalidShiftStatusError(this.id, this._status, ShiftStatus.CLOSED);
    }
    if (this._zReport) {
      return; // Ya sellado: inmutable
    }
    this._zReport = JSON.parse(JSON.stringify(report)) as ShiftReportData;
    this.touch();
  }

  /**
   * Copia profunda del turno (vía snapshot) que conserva la versión persistida.
   * Útil para adaptadores de UI que necesitan una instancia nueva por cada render.
   */
  public clone(): CashShift {
    const copy = CashShift.fromSnapshot(this.toSnapshot());
    copy._persistedVersion = this._persistedVersion;
    return copy;
  }

  /**
   * Serialización completa y sin pérdida del agregado (para persistencia / sincronización).
   */
  public toSnapshot(): CashShiftSnapshot {
    return {
      schemaVersion: CASHIER_SCHEMA_VERSION,
      id: this.id,
      cashRegisterId: this.cashRegisterId,
      cashier: this._cashier,
      currency: this.currency,
      status: this._status,
      initialBalance: this.initialBalance.toDecimal(),
      initialBreakdown: this.initialBreakdown?.toJSON(),
      drawerBreakdown: this._drawerBreakdown.toJSON(),
      maxCashThreshold: this.maxCashThreshold?.toDecimal(),
      openedAt: this.openedAt.toISOString(),
      closedAt: this.closedAt?.toISOString(),
      movements: this._movements.map((m) => m.toJSON()),
      suspensionHistory: this._suspensionHistory.map((r) => ({
        action: r.action,
        reason: r.reason,
        timestamp: r.timestamp.toISOString(),
        authorizedBy: r.authorizedBy,
        resumedAt: r.resumedAt?.toISOString(),
        resumedBy: r.resumedBy,
      })),
      handoverHistory: this._handoverHistory.map((h) => ({
        outgoingCashier: h.outgoingCashier,
        incomingCashier: h.incomingCashier,
        timestamp: h.timestamp.toISOString(),
        intermediateReconciliation: h.intermediateReconciliation.toJSON(),
        notes: h.notes,
      })),
      drawerOpenHistory: this._drawerOpenHistory.map((d) => ({
        reason: d.reason,
        performedBy: d.performedBy,
        authorizedBy: d.authorizedBy,
        timestamp: d.timestamp.toISOString(),
      })),
      denominationExchangeHistory: this._denominationExchangeHistory.map((e) => ({
        id: e.id,
        amount: e.amount.toDecimal(),
        currency: e.amount.currency,
        inBreakdown: e.inBreakdown.toJSON(),
        outBreakdown: e.outBreakdown.toJSON(),
        performedBy: e.performedBy,
        authorizedBy: e.authorizedBy,
        reason: e.reason,
        idempotencyKey: e.idempotencyKey,
        timestamp: e.timestamp.toISOString(),
      })),
      reconciliation: this._reconciliation?.toJSON(),
      zReport: this._zReport,
      xReportCount: this._xReportCount,
      openingNotes: this.openingNotes,
      closingNotes: this.closingNotes,
      version: this._version,
    };
  }

  /**
   * Reconstruye el agregado desde un snapshot (rehidratación desde BD, IndexedDB, sync offline, etc.).
   */
  public static fromSnapshot(raw: CashShiftSnapshot | unknown): CashShift {
    const snapshot = parseWithCashierSchema(CashShiftSnapshotSchema, raw, 'CashShiftSnapshot');
    const currency = snapshot.currency;
    return new CashShift({
      id: snapshot.id,
      cashRegisterId: snapshot.cashRegisterId,
      cashier: snapshot.cashier,
      currency,
      initialBalance: Money.fromDecimal(snapshot.initialBalance, currency),
      initialBreakdown: snapshot.initialBreakdown ? CashBreakdown.fromJSON(snapshot.initialBreakdown) : undefined,
      drawerBreakdown: CashBreakdown.fromJSON(snapshot.drawerBreakdown),
      maxCashThreshold: snapshot.maxCashThreshold !== undefined
        ? Money.fromDecimal(snapshot.maxCashThreshold, currency)
        : undefined,
      openedAt: new Date(snapshot.openedAt),
      closedAt: snapshot.closedAt ? new Date(snapshot.closedAt) : undefined,
      status: snapshot.status,
      movements: snapshot.movements.map((m) => CashMovement.fromJSON(m)),
      reconciliation: snapshot.reconciliation ? CashReconciliation.fromJSON(snapshot.reconciliation) : undefined,
      suspensionHistory: snapshot.suspensionHistory.map((r) => ({
        action: r.action,
        reason: r.reason,
        timestamp: new Date(r.timestamp),
        authorizedBy: r.authorizedBy,
        resumedAt: r.resumedAt ? new Date(r.resumedAt) : undefined,
        resumedBy: r.resumedBy,
      })),
      handoverHistory: snapshot.handoverHistory.map((h) => ({
        outgoingCashier: h.outgoingCashier,
        incomingCashier: h.incomingCashier,
        timestamp: new Date(h.timestamp),
        intermediateReconciliation: CashReconciliation.fromJSON(h.intermediateReconciliation),
        notes: h.notes,
      })),
      drawerOpenHistory: snapshot.drawerOpenHistory ? snapshot.drawerOpenHistory.map((d) => ({
        reason: d.reason,
        performedBy: d.performedBy,
        authorizedBy: d.authorizedBy,
        timestamp: new Date(d.timestamp),
      })) : undefined,
      denominationExchangeHistory: snapshot.denominationExchangeHistory
        ? snapshot.denominationExchangeHistory.map((e) => ({
            id: e.id,
            amount: Money.fromDecimal(e.amount, e.currency || currency),
            inBreakdown: CashBreakdown.fromJSON(e.inBreakdown),
            outBreakdown: CashBreakdown.fromJSON(e.outBreakdown),
            performedBy: e.performedBy,
            authorizedBy: e.authorizedBy,
            reason: e.reason,
            idempotencyKey: e.idempotencyKey,
            timestamp: new Date(e.timestamp),
          }))
        : undefined,
      zReport: snapshot.zReport,
      xReportCount: snapshot.xReportCount,
      openingNotes: snapshot.openingNotes,
      closingNotes: snapshot.closingNotes,
      version: snapshot.version,
    });
  }

  /**
   * Reconstruye el agregado desde su representación JSON (`toJSON()`) o desde un `CashShiftSnapshot`.
   */
  public static fromJSON(raw: CashShiftJSON | CashShiftSnapshot | unknown): CashShift {
    const json = parseWithCashierSchema(CashShiftJSONInputSchema, raw, 'CashShiftJSON');
    return CashShift.fromSnapshot({
      schemaVersion: CASHIER_SCHEMA_VERSION,
      id: json.id,
      cashRegisterId: json.cashRegisterId,
      cashier: json.cashier,
      currency: json.currency,
      status: json.status,
      initialBalance: json.initialBalance,
      initialBreakdown: json.initialBreakdown,
      drawerBreakdown: json.drawerBreakdown ?? { items: [], total: 0, currency: json.currency },
      maxCashThreshold: json.maxCashThreshold,
      openedAt: json.openedAt,
      closedAt: json.closedAt,
      movements: json.movements,
      suspensionHistory: json.suspensionHistory,
      handoverHistory: json.handoverHistory,
      drawerOpenHistory: json.drawerOpenHistory,
      denominationExchangeHistory: json.denominationExchangeHistory,
      reconciliation: json.reconciliation,
      zReport: json.zReport,
      xReportCount: json.xReportCount,
      openingNotes: json.openingNotes,
      closingNotes: json.closingNotes,
      version: json.version,
    });
  }

  public toJSON(): CashShiftJSON {
    const summary = this.calculateSummary();
    const snap = this.toSnapshot();
    return {
      schemaVersion: CASHIER_SCHEMA_VERSION,
      id: this.id,
      cashRegisterId: this.cashRegisterId,
      cashier: this._cashier,
      currency: this.currency,
      status: this._status,
      initialBalance: this.initialBalance.toDecimal(),
      initialBreakdown: this.initialBreakdown?.toJSON(),
      drawerBreakdown: this._drawerBreakdown.toJSON(),
      maxCashThreshold: this.maxCashThreshold?.toDecimal(),
      isCashLimitExceeded: summary.isCashLimitExceeded,
      openedAt: this.openedAt.toISOString(),
      closedAt: this.closedAt?.toISOString(),
      expectedCash: summary.currentCashInDrawer.toDecimal(),
      movementsCount: this._movements.length,
      suspensionsCount: this._suspensionHistory.length,
      handoversCount: this._handoverHistory.length,
      drawerOpeningsCount: this._drawerOpenHistory.length,
      denominationExchangesCount: this._denominationExchangeHistory.length,
      movements: snap.movements,
      suspensionHistory: snap.suspensionHistory,
      handoverHistory: snap.handoverHistory,
      drawerOpenHistory: snap.drawerOpenHistory ?? [],
      denominationExchangeHistory: snap.denominationExchangeHistory ?? [],
      summary: {
        totalSales: summary.totalSales.toDecimal(),
        totalRefunds: summary.totalRefunds.toDecimal(),
        totalDeposits: summary.totalDeposits.toDecimal(),
        totalWithdrawals: summary.totalWithdrawals.toDecimal(),
        totalSafeDrops: summary.totalSafeDrops.toDecimal(),
        totalTipsCollected: summary.totalTipsCollected.toDecimal(),
        totalTipsPaidOut: summary.totalTipsPaidOut.toDecimal(),
        unpaidTipsBalance: summary.unpaidTipsBalance.toDecimal(),
        totalVoidedAmount: summary.totalVoidedAmount.toDecimal(),
        currentCashInDrawer: summary.currentCashInDrawer.toDecimal(),
      },
      reconciliation: this._reconciliation?.toJSON(),
      zReport: this._zReport,
      xReportCount: this._xReportCount,
      version: this._version,
      openingNotes: this.openingNotes,
      closingNotes: this.closingNotes,
    };
  }
}

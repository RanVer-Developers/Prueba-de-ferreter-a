import { useCallback, useEffect, useRef, useState } from 'react';
import { useCashierContext } from '../context/CashierContext.js';
import {
  AuditCountUseCase,
  CashMovement,
  CashReconciliation,
  CashRoundingConfig,
  CashRoundingPolicy,
  CashShift,
  CloseShiftUseCase,
  ConsolidatedFinancialSummary,
  ConsolidatedSummaryQuery,
  DenominationExchangeRecord,
  ExchangeDenominationsUseCase,
  ExpenseCategory,
  ForeignTenderedInput,
  GenerateAuditReportUseCase,
  GetConsolidatedSummaryUseCase,
  HandoverShiftUseCase,
  Money,
  MovementType,
  OpenDrawerNoSaleResult,
  OpenDrawerNoSaleUseCase,
  OpenShiftUseCase,
  OptimalChangeResult,
  PaymentItemInput,
  PaymentMethod,
  PaymentResult,
  PayOutTipsUseCase,
  PosVoucherBatchInput,
  RecordMovementUseCase,
  RecordPaymentUseCase,
  RecordRefundUseCase,
  ResumeShiftUseCase,
  ShiftReportData,
  SuspendShiftUseCase,
  TipInput,
  UserSummary,
  VoidPaymentUseCase,
  VoidTransactionUseCase,
} from '@modulos/core-cashier';

export interface OpenShiftParams {
  shiftId?: string;
  cashier: UserSummary;
  initialAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  maxCashThreshold?: number;
  openingNotes?: string;
  enforceCarryOverFloat?: boolean;
}

export interface RecordPaymentParams {
  transactionReference: string;
  ticketTotal?: number;
  payments: PaymentItemInput[];
  tip?: TipInput;
  tenderedCash?: number;
  tenderedBreakdownCounts?: Record<number, number>;
  foreignTendered?: ForeignTenderedInput;
  cashRounding?: CashRoundingPolicy | CashRoundingConfig;
  requireExactDenominations?: boolean;
  idempotencyKey?: string;
  concept?: string;
  performedBy: UserSummary;
}

export interface RecordMovementParams {
  movementId?: string;
  type: MovementType;
  amount: number;
  paymentMethod?: PaymentMethod;
  concept: string;
  referenceId?: string;
  idempotencyKey?: string;
  expenseCategory?: ExpenseCategory;
  expenseSupplierName?: string;
  expenseSupplierTaxId?: string;
  expenseInvoiceNumber?: string;
  safeDropEnvelopeNumber?: string;
  safeDropSealNumber?: string;
  safeDropWitness?: UserSummary;
  safeDropDestinationVault?: string;
  breakdownCounts?: Record<number, number>;
  performedBy: UserSummary;
  allowNegativeCash?: boolean;
}

export interface RecordRefundParams {
  movementId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  concept: string;
  referenceId?: string;
  originalPaymentMethod?: PaymentMethod;
  disallowCrossMethodRefund?: boolean;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  idempotencyKey?: string;
  paidOutBreakdownCounts?: Record<number, number>;
  allowNegativeCash?: boolean;
}

export interface SafeDropParams {
  amount: number;
  reason: string;
  movementId?: string;
  idempotencyKey?: string;
  performedBy: UserSummary;
  envelopeNumber?: string;
  bagSealNumber?: string;
  witness?: UserSummary;
  destinationVault?: string;
  breakdownCounts?: Record<number, number>;
}

export interface OpenDrawerNoSaleParams {
  reason: string;
  performedBy?: UserSummary;
  authorizedBy?: UserSummary;
  requireSupervisor?: boolean;
}

export interface HandoverShiftParams {
  incomingCashier: UserSummary;
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
  notes?: string;
  supervisorId?: string;
  supervisor?: UserSummary;
  signatureToken?: string;
}

export interface VoidPaymentParams {
  movementIdToVoid: string;
  reason: string;
  authorizedBy: UserSummary;
  voidMovementId?: string;
  returnedBreakdownCounts?: Record<number, number>;
}

export interface AuditCountParams {
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
  notes?: string;
  isBlindCount?: boolean;
  supervisorId?: string;
  supervisor?: UserSummary;
  signatureToken?: string;
  auditorId?: string;
}

export interface CloseShiftParams {
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
  posVoucherBatches?: PosVoucherBatchInput[];
  retainedFloatAmount?: number;
  retainedBreakdownCounts?: Record<number, number>;
  closingNotes?: string;
  isBlindCount?: boolean;
  supervisorId?: string;
  supervisor?: UserSummary;
  signatureToken?: string;
  auditorId?: string;
  authorizedBy?: UserSummary;
}

export interface LiveChangeCalculation {
  cashRequired: number;
  changeGiven: number;
}

/**
 * Hook para ejecutar todas las operaciones de negocio de caja con estado de carga y manejo de errores.
 */
export function useCashier() {
  const {
    registerRepo,
    shiftRepo,
    currentRegisterId,
    activeShift,
    lastShiftId,
    options,
    publishEvent,
    refresh,
  } = useCashierContext();

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const pendingCountRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const runAction = useCallback(
    async <T,>(action: () => Promise<T>, shouldRefresh = true): Promise<T> => {
      pendingCountRef.current += 1;
      if (isMountedRef.current) {
        setIsSubmitting(true);
        setError(null);
      }
      try {
        const result = await action();
        if (shouldRefresh) {
          await refresh();
        }
        return result;
      } catch (err: unknown) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        if (isMountedRef.current) {
          setError(errorObj);
        }
        throw err;
      } finally {
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
        if (isMountedRef.current && pendingCountRef.current === 0) {
          setIsSubmitting(false);
        }
      }
    },
    [refresh]
  );

  const requireShift = useCallback((): CashShift => {
    if (!activeShift) {
      throw new Error('No hay un turno activo en la caja actual.');
    }
    return activeShift;
  }, [activeShift]);

  const openShift = useCallback(
    (params: OpenShiftParams): Promise<CashShift> =>
      runAction(() => {
        const useCase = new OpenShiftUseCase(registerRepo, shiftRepo, publishEvent);
        return useCase.execute({
          shiftId: params.shiftId || `shift-${globalThis.crypto.randomUUID()}`,
          cashRegisterId: currentRegisterId,
          cashier: params.cashier,
          initialAmount: params.initialAmount,
          cashBreakdownCounts: params.cashBreakdownCounts,
          maxCashThreshold: params.maxCashThreshold,
          openingNotes: params.openingNotes,
          enforceCarryOverFloat: params.enforceCarryOverFloat ?? options?.enforceCarryOverFloatOnOpen,
        });
      }),
    [runAction, registerRepo, shiftRepo, currentRegisterId, publishEvent, options?.enforceCarryOverFloatOnOpen]
  );

  const recordPayment = useCallback(
    (params: RecordPaymentParams): Promise<PaymentResult> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new RecordPaymentUseCase(shiftRepo, publishEvent, {
          features: options?.features,
        });
        return useCase.execute({
          shiftId: shift.id,
          transactionReference: params.transactionReference,
          ticketTotal: params.ticketTotal,
          concept: params.concept,
          payments: params.payments,
          tip: params.tip,
          tenderedCash: params.tenderedCash,
          tenderedBreakdownCounts: params.tenderedBreakdownCounts,
          foreignTendered: params.foreignTendered,
          cashRounding: params.cashRounding,
          requireExactDenominations: params.requireExactDenominations,
          idempotencyKey: params.idempotencyKey,
          performedBy: params.performedBy,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.features]
  );

  const recordMovement = useCallback(
    (params: RecordMovementParams): Promise<CashMovement> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new RecordMovementUseCase(shiftRepo, publishEvent, {
          features: options?.features,
        });
        return useCase.execute({
          movementId: params.movementId || `mov-${globalThis.crypto.randomUUID()}`,
          shiftId: shift.id,
          type: params.type,
          amount: params.amount,
          paymentMethod: params.paymentMethod,
          concept: params.concept,
          referenceId: params.referenceId,
          idempotencyKey: params.idempotencyKey,
          expenseCategory: params.expenseCategory,
          expenseSupplierName: params.expenseSupplierName,
          expenseSupplierTaxId: params.expenseSupplierTaxId,
          expenseInvoiceNumber: params.expenseInvoiceNumber,
          safeDropEnvelopeNumber: params.safeDropEnvelopeNumber,
          safeDropSealNumber: params.safeDropSealNumber,
          safeDropWitness: params.safeDropWitness,
          safeDropDestinationVault: params.safeDropDestinationVault,
          breakdownCounts: params.breakdownCounts,
          performedBy: params.performedBy,
          allowNegativeCash: params.allowNegativeCash,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.features]
  );

  const recordRefund = useCallback(
    (params: RecordRefundParams): Promise<CashMovement> =>
      runAction(() => {
        const shift = requireShift();
        const policyOpts = {
          ...options?.refundPolicy,
          ...(options?.authorizationPolicy && !options?.refundPolicy?.authorizationPolicy
            ? { authorizationPolicy: options.authorizationPolicy }
            : {}),
          features: options?.refundPolicy?.features ?? options?.features,
        };
        const useCase = new RecordRefundUseCase(shiftRepo, publishEvent, policyOpts);
        return useCase.execute({
          movementId: params.movementId || `ref-${globalThis.crypto.randomUUID()}`,
          shiftId: shift.id,
          amount: params.amount,
          paymentMethod: params.paymentMethod,
          concept: params.concept,
          referenceId: params.referenceId,
          originalPaymentMethod: params.originalPaymentMethod,
          disallowCrossMethodRefund: params.disallowCrossMethodRefund,
          performedBy: params.performedBy,
          authorizedBy: params.authorizedBy,
          idempotencyKey: params.idempotencyKey,
          paidOutBreakdownCounts: params.paidOutBreakdownCounts,
          allowNegativeCash: params.allowNegativeCash,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.authorizationPolicy, options?.refundPolicy, options?.features]
  );

  const safeDrop = useCallback(
    (params: SafeDropParams): Promise<CashMovement> =>
      recordMovement({
        movementId: params.movementId,
        type: MovementType.SAFE_DROP,
        amount: params.amount,
        paymentMethod: PaymentMethod.CASH,
        concept: params.reason,
        idempotencyKey: params.idempotencyKey,
        performedBy: params.performedBy,
        safeDropEnvelopeNumber: params.envelopeNumber,
        safeDropSealNumber: params.bagSealNumber,
        safeDropWitness: params.witness,
        safeDropDestinationVault: params.destinationVault,
        breakdownCounts: params.breakdownCounts,
      }),
    [recordMovement]
  );

  const auditCount = useCallback(
    (params: AuditCountParams): Promise<CashReconciliation> =>
      runAction(
        () => {
          const shift = requireShift();
          const useCase = new AuditCountUseCase(shiftRepo, publishEvent, {
            authorizationPolicy: options?.authorizationPolicy,
            signatureVerifier: options?.signatureVerifier,
            features: options?.features,
          });
          return useCase.execute({
            shiftId: shift.id,
            declaredCashAmount: params.declaredCashAmount,
            cashBreakdownCounts: params.cashBreakdownCounts,
            declaredByMethod: params.declaredByMethod,
            notes: params.notes,
            isBlindCount: params.isBlindCount,
            supervisorId: params.supervisorId,
            supervisor: params.supervisor,
            signatureToken: params.signatureToken,
            auditorId: params.auditorId,
          });
        },
        false
      ),
    [runAction, requireShift, shiftRepo, publishEvent, options?.authorizationPolicy, options?.signatureVerifier, options?.features]
  );

  const suspendShift = useCallback(
    (reason: string, authorizedBy?: UserSummary): Promise<CashShift> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new SuspendShiftUseCase(shiftRepo, publishEvent);
        return useCase.execute({
          shiftId: shift.id,
          reason,
          mode: 'SUSPEND',
          authorizedBy,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent]
  );

  const resumeShift = useCallback(
    (authorizedBy?: UserSummary): Promise<CashShift> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new ResumeShiftUseCase(shiftRepo, publishEvent, options?.authorizationPolicy);
        return useCase.execute({
          shiftId: shift.id,
          authorizedBy,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.authorizationPolicy]
  );

  const lockTerminal = useCallback(
    (reason: string): Promise<CashShift> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new SuspendShiftUseCase(shiftRepo, publishEvent);
        return useCase.execute({
          shiftId: shift.id,
          reason,
          mode: 'LOCK',
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent]
  );

  const unlockTerminal = useCallback(
    (authorizedBy?: UserSummary): Promise<CashShift> => resumeShift(authorizedBy),
    [resumeShift]
  );

  const closeShift = useCallback(
    (params: CloseShiftParams): Promise<CashShift> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new CloseShiftUseCase(registerRepo, shiftRepo, publishEvent, {
          authorizationPolicy: options?.authorizationPolicy,
          signatureVerifier: options?.signatureVerifier,
          discrepancyTolerance: options?.discrepancyTolerance,
          requireSupervisorOnLockedClose: options?.requireSupervisorOnLockedClose,
          features: options?.features,
        });
        return useCase.execute({
          shiftId: shift.id,
          declaredCashAmount: params.declaredCashAmount,
          cashBreakdownCounts: params.cashBreakdownCounts,
          declaredByMethod: params.declaredByMethod,
          posVoucherBatches: params.posVoucherBatches,
          retainedFloatAmount: params.retainedFloatAmount,
          retainedBreakdownCounts: params.retainedBreakdownCounts,
          closingNotes: params.closingNotes,
          isBlindCount: params.isBlindCount,
          supervisorId: params.supervisorId,
          supervisor: params.supervisor,
          signatureToken: params.signatureToken,
          auditorId: params.auditorId,
          authorizedBy: params.authorizedBy,
        });
      }),
    [
      runAction,
      requireShift,
      registerRepo,
      shiftRepo,
      publishEvent,
      options?.authorizationPolicy,
      options?.signatureVerifier,
      options?.discrepancyTolerance,
      options?.requireSupervisorOnLockedClose,
      options?.features,
    ]
  );

  const handoverShift = useCallback(
    (params: HandoverShiftParams): Promise<{ shift: CashShift; reconciliation: CashReconciliation }> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new HandoverShiftUseCase(shiftRepo, publishEvent, {
          authorizationPolicy: options?.authorizationPolicy,
          signatureVerifier: options?.signatureVerifier,
          features: options?.features,
        });
        return useCase.execute({
          shiftId: shift.id,
          incomingCashier: params.incomingCashier,
          declaredCashAmount: params.declaredCashAmount,
          cashBreakdownCounts: params.cashBreakdownCounts,
          declaredByMethod: params.declaredByMethod,
          notes: params.notes,
          supervisorId: params.supervisorId,
          supervisor: params.supervisor,
          signatureToken: params.signatureToken,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.authorizationPolicy, options?.signatureVerifier, options?.features]
  );

  const voidPayment = useCallback(
    (params: VoidPaymentParams): Promise<CashMovement> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new VoidPaymentUseCase(shiftRepo, publishEvent, {
          authorizationPolicy: options?.authorizationPolicy,
          features: options?.features,
        });
        return useCase.execute({
          shiftId: shift.id,
          movementIdToVoid: params.movementIdToVoid,
          reason: params.reason,
          authorizedBy: params.authorizedBy,
          voidMovementId: params.voidMovementId,
          returnedBreakdownCounts: params.returnedBreakdownCounts,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.authorizationPolicy, options?.features]
  );

  const generateAuditReport = useCallback(
    (type: 'X' | 'Z', shiftId?: string): Promise<ShiftReportData> =>
      runAction(() => {
        const targetShiftId = shiftId ?? activeShift?.id ?? lastShiftId;
        if (!targetShiftId) {
          throw new Error('No hay un turno activo o reciente para generar el reporte.');
        }
        const useCase = new GenerateAuditReportUseCase(shiftRepo, registerRepo);
        return useCase.execute(targetShiftId, type);
      }),
    [runAction, activeShift?.id, lastShiftId, shiftRepo, registerRepo]
  );

  /**
   * Cálculo reactivo en vivo de vuelto y efectivo requerido para formularios de cobro.
   */
  const calculateLiveChange = useCallback(
    (ticketTotal: number, nonCashTotal = 0, tenderedCash = 0): LiveChangeCalculation => {
      const required = Math.max(0, ticketTotal - nonCashTotal);
      const change = tenderedCash >= required ? tenderedCash - required : 0;
      return {
        cashRequired: required,
        changeGiven: change,
      };
    },
    []
  );

  /**
   * Cálculo en vivo del desglose óptimo de billetes y monedas a entregar para un monto de cambio.
   */
  const calculateOptimalChange = useCallback(
    (changeAmount: number): OptimalChangeResult | null => {
      if (!activeShift || changeAmount <= 0) return null;
      return activeShift.calculateOptimalChange(Money.fromDecimal(changeAmount, activeShift.currency));
    },
    [activeShift]
  );

  /**
   * Apertura auditada de gaveta de dinero sin venta (No Sale / Kick Drawer).
   */
  const openDrawerNoSale = useCallback(
    (params: OpenDrawerNoSaleParams): Promise<OpenDrawerNoSaleResult> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new OpenDrawerNoSaleUseCase(shiftRepo, publishEvent, {
          authorizationPolicy: options?.authorizationPolicy,
          features: options?.features,
        });
        return useCase.execute({
          shiftId: shift.id,
          reason: params.reason,
          performedBy: params.performedBy ?? shift.cashier,
          authorizedBy: params.authorizedBy,
          requireSupervisor: params.requireSupervisor,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.authorizationPolicy, options?.features]
  );

  const exchangeDenominations = useCallback(
    (params: {
      exchangeId?: string;
      inBreakdownCounts: Record<number, number>;
      outBreakdownCounts: Record<number, number>;
      performedBy: UserSummary;
      authorizedBy?: UserSummary;
      reason?: string;
      idempotencyKey?: string;
    }): Promise<DenominationExchangeRecord> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new ExchangeDenominationsUseCase(shiftRepo, publishEvent, {
          features: options?.features,
          authorizationPolicy: options?.authorizationPolicy,
        });
        return useCase.execute({
          exchangeId: params.exchangeId || `exch-${globalThis.crypto.randomUUID()}`,
          shiftId: shift.id,
          inBreakdownCounts: params.inBreakdownCounts,
          outBreakdownCounts: params.outBreakdownCounts,
          performedBy: params.performedBy,
          authorizedBy: params.authorizedBy,
          reason: params.reason,
          idempotencyKey: params.idempotencyKey,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.features, options?.authorizationPolicy]
  );

  const voidTransaction = useCallback(
    (params: {
      transactionReference: string;
      reason: string;
      authorizedBy: UserSummary;
      voidIdPrefix?: string;
      returnedBreakdownCounts?: Record<number, number>;
    }): Promise<CashMovement[]> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new VoidTransactionUseCase(shiftRepo, publishEvent, {
          features: options?.features,
          authorizationPolicy: options?.authorizationPolicy,
        });
        return useCase.execute({
          shiftId: shift.id,
          transactionReference: params.transactionReference,
          reason: params.reason,
          authorizedBy: params.authorizedBy,
          voidIdPrefix: params.voidIdPrefix,
          returnedBreakdownCounts: params.returnedBreakdownCounts,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.features, options?.authorizationPolicy]
  );

  const payOutTips = useCallback(
    (params: {
      movementId?: string;
      amount?: number;
      serverEmployeeId?: string;
      serverName?: string;
      paymentMethod?: PaymentMethod;
      concept?: string;
      performedBy: UserSummary;
      authorizedBy?: UserSummary;
      breakdownCounts?: Record<number, number>;
      allowNegativeCash?: boolean;
      idempotencyKey?: string;
    }): Promise<CashMovement> =>
      runAction(() => {
        const shift = requireShift();
        const useCase = new PayOutTipsUseCase(shiftRepo, publishEvent, {
          features: options?.features,
          authorizationPolicy: options?.authorizationPolicy,
        });
        return useCase.execute({
          movementId: params.movementId || `tip-out-${globalThis.crypto.randomUUID()}`,
          shiftId: shift.id,
          amount: params.amount,
          serverEmployeeId: params.serverEmployeeId,
          serverName: params.serverName,
          paymentMethod: params.paymentMethod,
          concept: params.concept,
          performedBy: params.performedBy,
          authorizedBy: params.authorizedBy,
          breakdownCounts: params.breakdownCounts,
          allowNegativeCash: params.allowNegativeCash,
          idempotencyKey: params.idempotencyKey,
        });
      }),
    [runAction, requireShift, shiftRepo, publishEvent, options?.features, options?.authorizationPolicy]
  );

  const getConsolidatedSummary = useCallback(
    (query: ConsolidatedSummaryQuery = {}): Promise<ConsolidatedFinancialSummary> =>
      runAction(
        () => {
          const useCase = new GetConsolidatedSummaryUseCase(shiftRepo, registerRepo, {
            features: options?.features,
          });
          return useCase.execute(query);
        },
        false
      ),
    [runAction, shiftRepo, registerRepo, options?.features]
  );

  return {
    openShift,
    recordPayment,
    recordRefund,
    recordMovement,
    voidPayment,
    voidTransaction,
    exchangeDenominations,
    payOutTips,
    getConsolidatedSummary,
    handoverShift,
    generateAuditReport,
    safeDrop,
    openDrawerNoSale,
    auditCount,
    suspendShift,
    resumeShift,
    lockTerminal,
    unlockTerminal,
    closeShift,
    calculateLiveChange,
    calculateOptimalChange,
    isSubmitting,
    error,
    clearError,
  };
}

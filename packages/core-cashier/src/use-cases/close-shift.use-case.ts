import {
  CashRegisterNotFoundError,
  InvalidMoneyAmountError,
  SelfApprovalNotAllowedError,
  ShiftNotFoundError,
  SupervisorApprovalRequiredError,
} from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { CashShift } from '../domain/entities/cash-shift.js';
import { PosVoucherBatch } from '../domain/entities/cash-reconciliation.js';
import { ShiftClosedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import { ISignatureVerifier } from '../domain/services/signature-verifier.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { Money } from '../domain/value-objects/money.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashRegisterRepository } from '../repositories/cash-register-repository.interface.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';
import { buildDeclaredAmounts, verifySupervisorSignature } from './reconciliation-helper.js';

export interface PosVoucherBatchInput {
  terminalId: string;
  batchNumber: string;
  paymentMethod: PaymentMethod;
  voucherCount: number;
  totalAmount: number;
}

export interface CloseShiftDTO {
  shiftId: string;
  auditorId?: string;
  supervisorId?: string;
  /** Supervisor completo (con rol) para validación estricta vía `IAuthorizationPolicy`. */
  supervisor?: UserSummary;
  signatureToken?: string;
  isBlindCount?: boolean;
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
  posVoucherBatches?: PosVoucherBatchInput[]; // Lotes de terminales POS
  retainedFloatAmount?: number;                // Fondo fijo que queda en gaveta para el próximo turno
  retainedBreakdownCounts?: Record<number, number>; // Desglose físico específico de los billetes/monedas retenidos como fondo
  closingNotes?: string;
  /** Supervisor que autoriza el cierre forzado de un turno LOCKED (obligatorio en ese caso). */
  authorizedBy?: UserSummary;
}

export interface CloseShiftOptions {
  /** Política para validar al supervisor del cierre forzado o con descuadre (por defecto: rol supervisor y sin autoaprobación). */
  authorizationPolicy?: IAuthorizationPolicy;
  /** Verifica `signatureToken` del supervisor. Si se informa, un supervisor con token inválido bloquea el cierre. */
  signatureVerifier?: ISignatureVerifier;
  /**
   * Diferencia máxima tolerada (en la moneda del turno) por método de pago sin intervención de supervisor.
   * Si alguna diferencia la supera, se exige `supervisor` o `supervisorId` (y firma si hay verificador).
   */
  discrepancyTolerance?: number;
  /**
   * Si es true, cerrar un turno en estado `LOCKED` exige que venga `authorizedBy` validado por `authorizationPolicy`.
   * Por defecto false (permite cerrar turnos bloqueados para no atascar la caja y valida `authorizedBy` si se informa).
   */
  requireSupervisorOnLockedClose?: boolean;
}

/**
 * Caso de uso: Cierre definitivo de turno de caja y liberación de la terminal.
 * Admite arqueo ciego, vouchers POS y separación de fondo retenido (Float) vs remesa bancaria.
 */
export class CloseShiftUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly registerRepo: ICashRegisterRepository,
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    private readonly options: CloseShiftOptions = {}
  ) {
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: CloseShiftDTO): Promise<CashShift> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    const register = await this.registerRepo.findById(shift.cashRegisterId);
    if (!register) {
      throw new CashRegisterNotFoundError(shift.cashRegisterId);
    }

    const { cashBreakdown, declaredMap } = buildDeclaredAmounts(shift.currency, dto);

    let posBatches: PosVoucherBatch[] | undefined;
    if (dto.posVoucherBatches && dto.posVoucherBatches.length > 0) {
      posBatches = dto.posVoucherBatches.map((b) => ({
        terminalId: b.terminalId,
        batchNumber: b.batchNumber,
        paymentMethod: b.paymentMethod,
        voucherCount: b.voucherCount,
        totalAmount: Money.fromDecimal(b.totalAmount, shift.currency),
      }));
    }

    let retainedBreakdown: CashBreakdown | undefined;
    if (dto.retainedBreakdownCounts && Object.keys(dto.retainedBreakdownCounts).length > 0) {
      retainedBreakdown = new CashBreakdown(dto.retainedBreakdownCounts, shift.currency);
    }

    const retainedFloat = dto.retainedFloatAmount !== undefined
      ? Money.fromDecimal(dto.retainedFloatAmount, shift.currency)
      : retainedBreakdown?.calculateTotal();

    if (retainedFloat && retainedBreakdown && !retainedBreakdown.calculateTotal().equals(retainedFloat)) {
      throw new InvalidMoneyAmountError(
        retainedBreakdown.calculateTotal().toDecimal(),
        `El desglose de fondo retenido (${retainedBreakdown.calculateTotal().toString()}) no coincide con el monto (${retainedFloat.toString()}).`
      );
    }

    if (!retainedBreakdown && retainedFloat && cashBreakdown && cashBreakdown.calculateTotal().equals(retainedFloat)) {
      retainedBreakdown = cashBreakdown;
    }

    if (dto.supervisor) {
      this.authorizationPolicy.assertCanAuthorize('CLOSE_WITH_DISCREPANCY', dto.supervisor, shift.cashier);
    }

    const effectiveSupervisorId = dto.supervisor?.id ?? dto.supervisorId;

    const reconciliation = shift.generateReconciliation(
      declaredMap,
      cashBreakdown,
      dto.auditorId,
      dto.closingNotes,
      effectiveSupervisorId,
      dto.signatureToken,
      dto.isBlindCount ?? false,
      posBatches,
      retainedFloat
    );

    if (effectiveSupervisorId && effectiveSupervisorId === shift.cashier.id) {
      throw new SelfApprovalNotAllowedError(effectiveSupervisorId, 'CLOSE_WITH_DISCREPANCY');
    }

    if (this.options.discrepancyTolerance !== undefined) {
      const tolerance = Money.fromDecimal(this.options.discrepancyTolerance, shift.currency);
      const exceeds = reconciliation.methodSummaries.some(
        (m) => m.difference.toCents() !== 0 && Math.abs(m.difference.toCents()) > tolerance.toCents()
      );
      if (exceeds && !effectiveSupervisorId) {
        throw new SupervisorApprovalRequiredError(
          'CLOSE_WITH_DISCREPANCY',
          `La diferencia de arqueo supera la tolerancia de ${tolerance.toString()}.`
        );
      }
    }

    await verifySupervisorSignature(
      shift.id,
      effectiveSupervisorId,
      dto.signatureToken,
      reconciliation.declaredCash,
      this.options.signatureVerifier
    );

    if (shift.isLocked() && (this.options.requireSupervisorOnLockedClose || dto.authorizedBy)) {
      this.authorizationPolicy.assertCanAuthorize('FORCE_CLOSE_LOCKED', dto.authorizedBy, shift.cashier);
    }

    shift.close(reconciliation, dto.closingNotes, dto.authorizedBy);
    register.releaseShift();
    register.setCarryOverFloat(retainedFloat, retainedBreakdown);

    await this.shiftRepo.save(shift);
    await this.registerRepo.save(register);

    if (this.publishEvent) {
      await this.publishEvent(new ShiftClosedEvent(shift, reconciliation));
    }

    return shift;
  }
}

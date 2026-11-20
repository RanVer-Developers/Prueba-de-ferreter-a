import { SelfApprovalNotAllowedError, ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { CashReconciliation } from '../domain/entities/cash-reconciliation.js';
import { CashShift } from '../domain/entities/cash-shift.js';
import { ShiftHandoverEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import { ISignatureVerifier } from '../domain/services/signature-verifier.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';
import { buildDeclaredAmounts, verifySupervisorSignature } from './reconciliation-helper.js';

export interface HandoverShiftDTO {
  shiftId: string;
  incomingCashier: UserSummary;
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
  notes?: string;
  supervisorId?: string;
  /** Supervisor completo (con rol) para validación vía `IAuthorizationPolicy`. */
  supervisor?: UserSummary;
  signatureToken?: string;
}

export interface HandoverShiftOptions {
  /** Política para validar al supervisor cuando se informa `supervisor`. */
  authorizationPolicy?: IAuthorizationPolicy;
  /** Verifica `signatureToken` del supervisor cuando se informa `supervisor` o `supervisorId`. */
  signatureVerifier?: ISignatureVerifier;
}

/**
 * Caso de uso: Relevo de cajero (Handover) en un turno continuo sin cerrarlo.
 */
export class HandoverShiftUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    private readonly options: HandoverShiftOptions = {}
  ) {
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: HandoverShiftDTO): Promise<{
    shift: CashShift;
    reconciliation: CashReconciliation;
  }> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    const outgoingCashier = shift.cashier;

    if (dto.incomingCashier.id === outgoingCashier.id) {
      throw new SelfApprovalNotAllowedError(dto.incomingCashier.id, 'HANDOVER');
    }

    if (dto.supervisor) {
      this.authorizationPolicy.assertCanAuthorize('HANDOVER', dto.supervisor, outgoingCashier);
    }

    const effectiveSupervisorId = dto.supervisor?.id ?? dto.supervisorId;
    if (
      effectiveSupervisorId &&
      (effectiveSupervisorId === outgoingCashier.id || effectiveSupervisorId === dto.incomingCashier.id)
    ) {
      throw new SelfApprovalNotAllowedError(effectiveSupervisorId, 'HANDOVER');
    }

    const { cashBreakdown, declaredMap } = buildDeclaredAmounts(shift.currency, dto);

    const reconciliation = shift.generateReconciliation(
      declaredMap,
      cashBreakdown,
      outgoingCashier.id,
      dto.notes || `Relevo de ${outgoingCashier.name} a ${dto.incomingCashier.name}`,
      effectiveSupervisorId,
      dto.signatureToken
    );

    await verifySupervisorSignature(
      shift.id,
      effectiveSupervisorId,
      dto.signatureToken,
      reconciliation.declaredCash,
      this.options.signatureVerifier
    );

    shift.handover(dto.incomingCashier, reconciliation, dto.notes);

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      await this.publishEvent(
        new ShiftHandoverEvent(shift.id, outgoingCashier, dto.incomingCashier, reconciliation)
      );
    }

    return { shift, reconciliation };
  }
}

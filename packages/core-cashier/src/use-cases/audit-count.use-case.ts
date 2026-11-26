import { SelfApprovalNotAllowedError, ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { CashReconciliation } from '../domain/entities/cash-reconciliation.js';
import { CashAuditPerformedEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { ISignatureVerifier } from '../domain/services/signature-verifier.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';
import { buildDeclaredAmounts, verifySupervisorSignature } from './reconciliation-helper.js';

export interface AuditCountDTO {
  shiftId: string;
  auditorId?: string;
  supervisorId?: string;
  /** Supervisor completo (con rol) para validación vía `IAuthorizationPolicy`. */
  supervisor?: UserSummary;
  signatureToken?: string;
  isBlindCount?: boolean;
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
  notes?: string;
}

export interface AuditCountOptions {
  /** Política para validar al supervisor cuando se informa `supervisor`. */
  authorizationPolicy?: IAuthorizationPolicy;
  /** Verifica `signatureToken` del supervisor cuando se informa `supervisor` o `supervisorId`. */
  signatureVerifier?: ISignatureVerifier;
  /** Perfil o mapa de capacidades activas. */
  features?: CashierFeatureProfile;
}

/**
 * Caso de uso: Realizar un arqueo intermedio o auditoría sorpresa sin cerrar el turno.
 * Con soporte para arqueo ciego (Blind Count) y firma de supervisor.
 */
export class AuditCountUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;
  private readonly features: CashierFeatureFlags;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    private readonly options: AuditCountOptions = {}
  ) {
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
    this.features = resolveCashierFeatures(options.features);
  }

  public async execute(dto: AuditCountDTO): Promise<CashReconciliation> {
    if (dto.isBlindCount) {
      assertFeatureEnabled(this.features, 'blindCounts');
    }
    if (dto.signatureToken) {
      assertFeatureEnabled(this.features, 'supervisorSignatures');
    }

    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (dto.supervisor) {
      this.authorizationPolicy.assertCanAuthorize('AUDIT_COUNT', dto.supervisor, shift.cashier);
    }

    const effectiveSupervisorId = dto.supervisor?.id ?? dto.supervisorId;
    if (effectiveSupervisorId && effectiveSupervisorId === shift.cashier.id) {
      throw new SelfApprovalNotAllowedError(effectiveSupervisorId, 'AUDIT_COUNT');
    }

    const { cashBreakdown, declaredMap } = buildDeclaredAmounts(shift.currency, dto);

    const reconciliation = shift.generateReconciliation(
      declaredMap,
      cashBreakdown,
      dto.auditorId,
      dto.notes,
      effectiveSupervisorId,
      dto.signatureToken,
      dto.isBlindCount ?? false
    );

    await verifySupervisorSignature(
      shift.id,
      effectiveSupervisorId,
      dto.signatureToken,
      reconciliation.declaredCash,
      this.options.signatureVerifier
    );

    if (this.publishEvent) {
      await this.publishEvent(new CashAuditPerformedEvent(shift.id, reconciliation));
    }

    return reconciliation;
  }
}

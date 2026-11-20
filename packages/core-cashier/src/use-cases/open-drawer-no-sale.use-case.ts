import { ShiftNotFoundError, SupervisorApprovalRequiredError } from '../domain/errors/cashier-errors.js';
import { UserSummary } from '../domain/entities/cash-movement.js';
import { DrawerOpenedWithoutSaleEvent } from '../domain/events/cashier-events.js';
import { IAuthorizationPolicy, SupervisorAuthorizationPolicy } from '../domain/services/authorization-policy.js';
import { ESC_POS_COMMANDS, ESC_POS_COMMANDS_BYTES } from '../formatters/escpos-ticket-formatter.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface OpenDrawerNoSaleDTO {
  shiftId: string;
  reason: string;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  /**
   * Si es true, exige supervisor validado para abrir el cajón (No-Sale Drawer Kick).
   */
  requireSupervisor?: boolean;
}

export interface OpenDrawerNoSaleResult {
  shiftId: string;
  reason: string;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  openedAt: Date;
  escPosCommand: string;
  escPosBytes: Uint8Array;
}

export interface OpenDrawerNoSaleOptions {
  authorizationPolicy?: IAuthorizationPolicy;
}

/**
 * Caso de uso: Apertura auditada del cajón portamonedas sin venta (Kick Drawer / No Sale).
 * Emite comando ESC/POS estándar, audita motivo, usuario y autorización de supervisor.
 */
export class OpenDrawerNoSaleUseCase {
  private readonly authorizationPolicy: IAuthorizationPolicy;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    options: OpenDrawerNoSaleOptions = {}
  ) {
    this.authorizationPolicy = options.authorizationPolicy ?? new SupervisorAuthorizationPolicy();
  }

  public async execute(dto: OpenDrawerNoSaleDTO): Promise<OpenDrawerNoSaleResult> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    if (dto.requireSupervisor) {
      if (!dto.authorizedBy || !dto.authorizedBy.id) {
        throw new SupervisorApprovalRequiredError(
          'OPEN_DRAWER_NO_SALE',
          'Se requiere autorización de supervisor para abrir la gaveta sin venta.'
        );
      }
      this.authorizationPolicy.assertCanAuthorize('OPEN_DRAWER_NO_SALE', dto.authorizedBy, dto.performedBy);
    } else if (dto.authorizedBy) {
      this.authorizationPolicy.assertCanAuthorize('OPEN_DRAWER_NO_SALE', dto.authorizedBy, dto.performedBy);
    }

    const record = shift.recordDrawerOpen(dto.reason, dto.performedBy, dto.authorizedBy);
    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      await this.publishEvent(
        new DrawerOpenedWithoutSaleEvent(shift.id, dto.performedBy, record.reason, dto.authorizedBy)
      );
    }

    return {
      shiftId: shift.id,
      reason: record.reason,
      performedBy: record.performedBy,
      authorizedBy: record.authorizedBy,
      openedAt: record.timestamp,
      escPosCommand: ESC_POS_COMMANDS.OPEN_DRAWER,
      escPosBytes: ESC_POS_COMMANDS_BYTES.OPEN_DRAWER,
    };
  }
}

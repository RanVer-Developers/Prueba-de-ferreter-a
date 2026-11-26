import { StockMovement, UserSummary } from '../domain/entities/stock-movement.js';
import {
  InsufficientRoleError,
  ItemNotFoundError,
  SelfApprovalNotAllowedError,
  WarehouseNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { BatchLot } from '../domain/value-objects/batch-lot.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export type LotQuarantineAction = 'QUARANTINE' | 'RELEASE' | 'WRITE_OFF';

export interface ManageLotQuarantineRequest {
  action: LotQuarantineAction;
  itemId: string;
  warehouseId: string;
  lotNumber: string;
  reason: string;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
}

export interface ManageLotQuarantineResponse {
  lot?: BatchLot;
  movement?: StockMovement;
}

export class ManageLotQuarantineUseCase {
  private readonly AUTHORIZED_ROLES = ['SUPERVISOR', 'MANAGER', 'ADMIN'];

  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: ManageLotQuarantineRequest): Promise<ManageLotQuarantineResponse> {
    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);

    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    if (request.action === 'QUARANTINE' || request.action === 'RELEASE') {
      if (request.action === 'RELEASE') {
        this.assertSupervisorAuthorization(request, 'Liberación de lote de cuarentena');
      }
      const lot = item.setLotStatus({
        warehouseId: request.warehouseId,
        lotNumber: request.lotNumber,
        status: request.action === 'QUARANTINE' ? 'QUARANTINED' : 'ACTIVE',
        reason: request.reason,
      });
      await this.itemRepo.save(item);
      if (this.eventBus) {
        const events = item.pullDomainEvents();
        if (events.length > 0) await this.eventBus.publish(events);
      }
      return { lot };
    }

    // WRITE_OFF requiere autorización de supervisor distinto al ejecutor
    this.assertSupervisorAuthorization(request, 'Baja de lote por vencimiento/cuarentena');

    const movementId = generateInventoryId('mov-woff');
    const movement = item.writeOffLot({
      movementId,
      warehouseId: request.warehouseId,
      lotNumber: request.lotNumber,
      reason: request.reason,
      performedBy: request.performedBy,
      authorizedBy: request.authorizedBy!,
    });

    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { movement };
  }

  private assertSupervisorAuthorization(request: ManageLotQuarantineRequest, actionLabel: string): void {
    if (!request.authorizedBy) {
      throw new InsufficientRoleError(this.AUTHORIZED_ROLES, request.performedBy.role ?? 'OPERATOR');
    }
    const role = request.authorizedBy.role?.toUpperCase() ?? '';
    if (!this.AUTHORIZED_ROLES.includes(role)) {
      throw new InsufficientRoleError(this.AUTHORIZED_ROLES, role);
    }
    if (request.performedBy.id === request.authorizedBy.id) {
      throw new SelfApprovalNotAllowedError(request.performedBy.id, actionLabel);
    }
  }
}

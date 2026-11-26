import { StockMovement, UserSummary } from '../domain/entities/stock-movement.js';
import {
  InsufficientRoleError,
  ItemNotFoundError,
  SelfApprovalNotAllowedError,
  WarehouseNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { BatchLotProps } from '../domain/value-objects/batch-lot.js';
import { Money } from '../domain/value-objects/money.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface AdjustStockRequest {
  itemId: string;
  warehouseId: string;
  deltaQuantity: number;
  reason: string;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  unitCost?: Money;
  lotNumber?: string;
  lotProps?: Omit<BatchLotProps, 'costPerUnit'>;
  serialNumbers?: string[];
  notes?: string;
  idempotencyKey?: string;
}

export interface AdjustStockResponse {
  movement: StockMovement;
  isReplay: boolean;
}

export class AdjustStockUseCase {
  private readonly AUTHORIZED_ROLES = ['SUPERVISOR', 'MANAGER', 'ADMIN'];

  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: AdjustStockRequest): Promise<AdjustStockResponse> {
    if (request.idempotencyKey) {
      const existing = await this.movementRepo.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return { movement: existing, isReplay: true };
      }
    }

    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);

    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    // Control Interno para ajustes negativos (merma / pérdida / desvío)
    if (request.deltaQuantity < 0) {
      if (!request.authorizedBy) {
        throw new InsufficientRoleError(this.AUTHORIZED_ROLES, request.performedBy.role ?? 'OPERATOR');
      }

      const role = request.authorizedBy.role?.toUpperCase() ?? '';
      if (!this.AUTHORIZED_ROLES.includes(role)) {
        throw new InsufficientRoleError(this.AUTHORIZED_ROLES, role);
      }

      if (request.performedBy.id === request.authorizedBy.id) {
        throw new SelfApprovalNotAllowedError(request.performedBy.id, 'Ajuste de merma/rotura');
      }
    }

    const movementId = generateInventoryId('mov-adj');

    const movement = item.adjustStock({
      movementId,
      warehouseId: request.warehouseId,
      deltaQuantity: request.deltaQuantity,
      reason: request.reason,
      unitCost: request.unitCost,
      lotNumber: request.lotNumber,
      lotProps: request.lotProps,
      serialNumbers: request.serialNumbers,
      performedBy: request.performedBy,
      authorizedBy: request.authorizedBy,
      notes: request.notes,
      idempotencyKey: request.idempotencyKey,
      allowNegativeStock: warehouse.allowNegativeStock,
    });

    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { movement, isReplay: false };
  }
}

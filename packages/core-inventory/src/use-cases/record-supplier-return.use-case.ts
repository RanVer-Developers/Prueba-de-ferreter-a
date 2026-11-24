import { StockMovement, StockMovementType, UserSummary } from '../domain/entities/stock-movement.js';
import { ItemNotFoundError, WarehouseInactiveError, WarehouseNotFoundError } from '../domain/errors/inventory-errors.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { Money } from '../domain/value-objects/money.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface RecordSupplierReturnRequest {
  itemId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  referenceId?: string; // Folio de RMA o guía de devolución
  lotNumber?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  notes?: string;
  idempotencyKey?: string;
}

export interface RecordSupplierReturnResponse {
  movement: StockMovement;
  totalCost: Money;
  isReplay: boolean;
}

export class RecordSupplierReturnUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository
  ) {}

  public async execute(request: RecordSupplierReturnRequest): Promise<RecordSupplierReturnResponse> {
    if (request.idempotencyKey) {
      const existing = await this.movementRepo.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return { movement: existing, totalCost: existing.totalCost, isReplay: true };
      }
    }

    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);
    if (!warehouse.isActive) throw new WarehouseInactiveError(request.warehouseId);

    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    const movementId = generateInventoryId('mov-ret-supp');

    const { movement, totalCost } = item.dispatchStock({
      movementId,
      warehouseId: request.warehouseId,
      quantity: request.quantity,
      referenceId: request.referenceId ?? request.reason,
      lotNumber: request.lotNumber,
      serialNumbers: request.serialNumbers,
      allowNegativeStock: false,
      performedBy: request.performedBy,
      notes: request.notes ?? `Devolución a proveedor por: ${request.reason}`,
      idempotencyKey: request.idempotencyKey,
      movementType: StockMovementType.SUPPLIER_RETURN,
    });

    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    return { movement, totalCost, isReplay: false };
  }
}

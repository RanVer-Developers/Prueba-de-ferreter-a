import { StockMovement, StockMovementType, UserSummary } from '../domain/entities/stock-movement.js';
import { ItemNotFoundError, WarehouseInactiveError, WarehouseNotFoundError } from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { Money } from '../domain/value-objects/money.js';
import { Quantity } from '../domain/value-objects/quantity.js';
import { UnitOfMeasure } from '../domain/value-objects/unit-of-measure.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface RecordStockOutRequest {
  itemId: string;
  warehouseId: string;
  quantity: number;
  inputUom?: UnitOfMeasure;
  referenceId?: string;
  lotNumber?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  notes?: string;
  idempotencyKey?: string;
  movementType?: StockMovementType;
}

export interface RecordStockOutResponse {
  movement: StockMovement;
  totalCost: Money;
  isReplay: boolean;
}

export class RecordStockOutUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: RecordStockOutRequest): Promise<RecordStockOutResponse> {
    // 1. Idempotencia
    if (request.idempotencyKey) {
      const existingMov = await this.movementRepo.findByIdempotencyKey(request.idempotencyKey);
      if (existingMov) {
        return { movement: existingMov, totalCost: existingMov.totalCost, isReplay: true };
      }
    }

    // 2. Validación de almacén
    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) {
      throw new WarehouseNotFoundError(request.warehouseId);
    }
    if (!warehouse.isActive) {
      throw new WarehouseInactiveError(request.warehouseId);
    }

    // 3. Obtener artículo
    const item = await this.itemRepo.findById(request.itemId);
    if (!item) {
      throw new ItemNotFoundError(request.itemId);
    }

    let effectiveQty = request.quantity;
    if (request.inputUom && request.inputUom.code !== item.uom.code) {
      effectiveQty = new Quantity(request.quantity, request.inputUom).convertTo(item.uom).value;
    }

    const movementId = generateInventoryId('mov-out');

    // 4. Despachar
    const { movement, totalCost } = item.dispatchStock({
      movementId,
      warehouseId: request.warehouseId,
      quantity: effectiveQty,
      referenceId: request.referenceId,
      lotNumber: request.lotNumber,
      serialNumbers: request.serialNumbers,
      allowNegativeStock: warehouse.allowNegativeStock,
      performedBy: request.performedBy,
      notes: request.notes,
      idempotencyKey: request.idempotencyKey,
      movementType: request.movementType,
    });

    // 5. Persistir cambios
    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { movement, totalCost, isReplay: false };
  }
}

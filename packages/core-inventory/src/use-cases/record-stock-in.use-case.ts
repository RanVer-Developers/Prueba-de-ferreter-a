import { StockMovement, StockMovementType, UserSummary } from '../domain/entities/stock-movement.js';
import { ItemNotFoundError, WarehouseInactiveError, WarehouseNotFoundError } from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { BatchLotProps } from '../domain/value-objects/batch-lot.js';
import { BinLocation } from '../domain/value-objects/bin-location.js';
import { Money } from '../domain/value-objects/money.js';
import { Quantity } from '../domain/value-objects/quantity.js';
import { UnitOfMeasure } from '../domain/value-objects/unit-of-measure.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface RecordStockInRequest {
  itemId: string;
  warehouseId: string;
  quantity: number;
  inputUom?: UnitOfMeasure;
  unitCost: Money | { amount: number; currency?: string };
  referenceId?: string;
  lotProps?: Omit<BatchLotProps, 'costPerUnit'>;
  serials?: string[];
  binLocation?: BinLocation;
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  notes?: string;
  idempotencyKey?: string;
  movementType?: StockMovementType;
}

export interface RecordStockInResponse {
  movement: StockMovement;
  isReplay: boolean;
}

export class RecordStockInUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: RecordStockInRequest): Promise<RecordStockInResponse> {
    // 1. Verificación de Idempotencia
    if (request.idempotencyKey) {
      const existingMov = await this.movementRepo.findByIdempotencyKey(request.idempotencyKey);
      if (existingMov) {
        return { movement: existingMov, isReplay: true };
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

    // 3. Obtener artículo de inventario
    const item = await this.itemRepo.findById(request.itemId);
    if (!item) {
      throw new ItemNotFoundError(request.itemId);
    }

    const rawUnitCost =
      request.unitCost instanceof Money
        ? request.unitCost
        : Money.fromDecimal(request.unitCost.amount, request.unitCost.currency ?? 'USD');

    let effectiveQty = request.quantity;
    let effectiveUnitCost = rawUnitCost;
    if (request.inputUom && request.inputUom.code !== item.uom.code) {
      const converted = new Quantity(request.quantity, request.inputUom).convertTo(item.uom);
      effectiveQty = converted.value;
      const totalCents = Math.round(rawUnitCost.toCents() * request.quantity);
      effectiveUnitCost = Money.fromCents(Math.round(totalCents / effectiveQty), rawUnitCost.currency);
    }

    const movementId = generateInventoryId('mov-in');

    // 4. Ejecutar entrada en el Aggregate Root
    const { movement } = item.receiveStock({
      movementId,
      warehouseId: request.warehouseId,
      quantity: effectiveQty,
      unitCost: effectiveUnitCost,
      referenceId: request.referenceId,
      lotProps: request.lotProps,
      serials: request.serials,
      binLocation: request.binLocation,
      performedBy: request.performedBy,
      authorizedBy: request.authorizedBy,
      notes: request.notes,
      idempotencyKey: request.idempotencyKey,
      movementType: request.movementType,
    });

    // 5. Persistir estado y Kardex
    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { movement, isReplay: false };
  }
}

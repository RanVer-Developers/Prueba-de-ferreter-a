import { InventoryItem } from '../domain/entities/inventory-item.js';
import { StockMovement, StockMovementType, UserSummary } from '../domain/entities/stock-movement.js';
import {
  CompositeProductNotFoundError,
  CurrencyMismatchError,
  InvalidQuantityError,
  ItemNotFoundError,
  WarehouseInactiveError,
  WarehouseNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus, InventoryDomainEvent } from '../domain/events/inventory-events.js';
import { BOMExplosionService } from '../domain/services/bom-explosion.service.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { Money } from '../domain/value-objects/money.js';
import { ICompositeProductRepository } from '../repositories/composite-product-repository.interface.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface DispatchCompositeProductRequest {
  compositeId: string;
  warehouseId: string;
  quantity: number;
  referenceId?: string;
  performedBy: UserSummary;
  notes?: string;
}

export interface DispatchCompositeProductResponse {
  compositeId: string;
  compositeSku: string;
  quantityDispatched: number;
  componentMovements: StockMovement[];
  totalCost: Money;
}

export class DispatchCompositeProductUseCase {
  constructor(
    private readonly compositeRepo: ICompositeProductRepository,
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: DispatchCompositeProductRequest): Promise<DispatchCompositeProductResponse> {
    if (request.quantity <= 0 || !Number.isFinite(request.quantity)) {
      throw new InvalidQuantityError(request.quantity, 'La cantidad a despachar del combo debe ser mayor a cero.');
    }

    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);
    if (!warehouse.isActive) throw new WarehouseInactiveError(request.warehouseId);

    const composite = await this.compositeRepo.findById(request.compositeId);
    if (!composite) throw new CompositeProductNotFoundError(request.compositeId);

    // 1. Cargar todos los componentes
    const componentItems = new Map<string, InventoryItem>();
    for (const comp of composite.components) {
      if (!componentItems.has(comp.itemId)) {
        const item = await this.itemRepo.findById(comp.itemId);
        if (!item) throw new ItemNotFoundError(comp.itemId);
        componentItems.set(comp.itemId, item);
      }
    }

    // 2. Validar disponibilidad atómica (si uno falla, no se descuenta ninguno)
    if (!warehouse.allowNegativeStock) {
      BOMExplosionService.ensureBOMAvailable(composite, request.warehouseId, request.quantity, componentItems);
    }

    // 3. Ejecutar todos los descuentos en memoria y validar moneda antes de persistir
    const componentMovements: StockMovement[] = [];
    const allEvents: InventoryDomainEvent[] = [];
    const preDispatchSnapshots = new Map<string, ReturnType<InventoryItem['toJSON']>>();
    let totalCostMoney: Money | undefined;

    for (const comp of composite.components) {
      const item = componentItems.get(comp.itemId)!;
      if (!preDispatchSnapshots.has(item.id)) {
        preDispatchSnapshots.set(item.id, item.toJSON());
      }
      const needed = comp.quantity * request.quantity;
      const movId = generateInventoryId('mov-bom-out');

      const { movement, totalCost } = item.dispatchStock({
        movementId: movId,
        warehouseId: request.warehouseId,
        quantity: needed,
        referenceId: request.referenceId ?? composite.compositeItemId,
        allowNegativeStock: warehouse.allowNegativeStock,
        performedBy: request.performedBy,
        notes: request.notes ?? `Despacho de combo ${composite.name} (x${request.quantity})`,
        movementType: StockMovementType.SALE_DISPATCH,
      });

      if (!totalCostMoney) {
        totalCostMoney = totalCost;
      } else {
        if (totalCostMoney.currency !== totalCost.currency) {
          throw new CurrencyMismatchError(totalCostMoney.currency, totalCost.currency);
        }
        totalCostMoney = totalCostMoney.add(totalCost);
      }

      componentMovements.push(movement);
      allEvents.push(...item.pullDomainEvents());
    }

    // 4. Persistir de manera atómica con rollback en caso de conflicto
    const savedItems: InventoryItem[] = [];
    try {
      for (const item of componentItems.values()) {
        await this.itemRepo.save(item);
        savedItems.push(item);
      }
      for (const movement of componentMovements) {
        await this.movementRepo.save(movement);
      }
    } catch (err) {
      for (const saved of savedItems) {
        const snap = preDispatchSnapshots.get(saved.id);
        if (snap) {
          await this.itemRepo.save(InventoryItem.fromJSON(snap)).catch(() => undefined);
        }
      }
      throw err;
    }

    if (this.eventBus && allEvents.length > 0) {
      await this.eventBus.publish(allEvents);
    }

    return {
      compositeId: composite.compositeItemId,
      compositeSku: composite.name,
      quantityDispatched: request.quantity,
      componentMovements,
      totalCost: totalCostMoney ?? Money.zero('USD'),
    };
  }
}

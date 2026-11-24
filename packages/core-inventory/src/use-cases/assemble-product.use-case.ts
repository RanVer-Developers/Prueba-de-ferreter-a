import { StockMovement, UserSummary } from '../domain/entities/stock-movement.js';
import {
  ItemNotFoundError,
  WarehouseInactiveError,
  WarehouseNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus, InventoryDomainEvent } from '../domain/events/inventory-events.js';
import { StockTransformationService } from '../domain/services/stock-transformation.service.js';
import { Money } from '../domain/value-objects/money.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface AssembleProductRequest {
  warehouseId: string;
  finishedItemId: string;
  quantityToProduce: number;
  recipeComponents: Array<{ itemId: string; quantityPerUnit: number }>;
  additionalCostPerUnit?: Money;
  performedBy: UserSummary;
  notes?: string;
}

export interface AssembleProductResponse {
  consumedMovements: StockMovement[];
  finishedMovement: StockMovement;
  totalProductionCost: Money;
  unitCost: Money;
}

export class AssembleProductUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: AssembleProductRequest): Promise<AssembleProductResponse> {
    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);
    if (!warehouse.isActive) throw new WarehouseInactiveError(request.warehouseId);

    const finishedItem = await this.itemRepo.findById(request.finishedItemId);
    if (!finishedItem) throw new ItemNotFoundError(request.finishedItemId);

    const resolvedComponents = [];
    for (const comp of request.recipeComponents) {
      const compItem = await this.itemRepo.findById(comp.itemId);
      if (!compItem) throw new ItemNotFoundError(comp.itemId);
      resolvedComponents.push({ item: compItem, quantityPerUnit: comp.quantityPerUnit });
    }

    const result = StockTransformationService.assemble({
      warehouseId: request.warehouseId,
      recipeComponents: resolvedComponents,
      finishedItem,
      quantityToProduce: request.quantityToProduce,
      additionalCostPerUnit: request.additionalCostPerUnit,
      performedBy: request.performedBy,
      notes: request.notes,
    });

    const allEvents: InventoryDomainEvent[] = [];

    for (const comp of resolvedComponents) {
      await this.itemRepo.save(comp.item);
      allEvents.push(...comp.item.pullDomainEvents());
    }
    for (const mov of result.consumedMovements) {
      await this.movementRepo.save(mov);
    }

    await this.itemRepo.save(finishedItem);
    await this.movementRepo.save(result.finishedMovement);
    allEvents.push(...finishedItem.pullDomainEvents());

    if (this.eventBus && allEvents.length > 0) {
      await this.eventBus.publish(allEvents);
    }

    return result;
  }
}

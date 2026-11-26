import { UserSummary } from '../domain/entities/stock-movement.js';
import { ItemNotFoundError, WarehouseInactiveError, WarehouseNotFoundError } from '../domain/errors/inventory-errors.js';
import {
  BreakPackResult,
  StockTransformationService,
} from '../domain/services/stock-transformation.service.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface BreakPackRequest {
  warehouseId: string;
  parentItemId: string;
  parentQuantityToBreak: number;
  childItemId: string;
  unitsPerPack: number;
  performedBy: UserSummary;
  notes?: string;
}

export class BreakPackUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository
  ) {}

  public async execute(request: BreakPackRequest): Promise<BreakPackResult> {
    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);
    if (!warehouse.isActive) throw new WarehouseInactiveError(request.warehouseId);

    const parentItem = await this.itemRepo.findById(request.parentItemId);
    if (!parentItem) throw new ItemNotFoundError(request.parentItemId);

    const childItem = await this.itemRepo.findById(request.childItemId);
    if (!childItem) throw new ItemNotFoundError(request.childItemId);

    const result = StockTransformationService.breakPack({
      warehouseId: request.warehouseId,
      parentItem,
      parentQuantityToBreak: request.parentQuantityToBreak,
      childItem,
      unitsPerPack: request.unitsPerPack,
      performedBy: request.performedBy,
      notes: request.notes,
    });

    await this.itemRepo.save(parentItem);
    await this.itemRepo.save(childItem);
    await this.movementRepo.save(result.parentMovement);
    await this.movementRepo.save(result.childMovement);

    return result;
  }
}

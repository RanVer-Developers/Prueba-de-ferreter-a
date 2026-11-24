import { InventoryCount } from '../domain/entities/inventory-count.js';
import { StockMovement, UserSummary } from '../domain/entities/stock-movement.js';
import { IInventoryCountRepository } from '../repositories/inventory-count-repository.interface.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';

export interface ReconcileInventoryCountRequest {
  countId: string;
  reconciledBy: UserSummary;
  authorizedBy?: UserSummary;
}

export interface ReconcileInventoryCountResponse {
  count: InventoryCount;
  adjustmentsApplied: StockMovement[];
}

export class ReconcileInventoryCountUseCase {
  constructor(
    private readonly countRepo: IInventoryCountRepository,
    private readonly itemRepo: IInventoryItemRepository,
    private readonly movementRepo: IStockMovementRepository
  ) {}

  public async execute(request: ReconcileInventoryCountRequest): Promise<ReconcileInventoryCountResponse> {
    const count = await this.countRepo.findById(request.countId);
    if (!count) {
      throw new Error(`Toma física con id '${request.countId}' no encontrada.`);
    }

    // Ejecuta la reconciliación del arqueo (valida autoaprobación de diferencias)
    const reconciledCount = count.reconcile(request.reconciledBy, request.authorizedBy);

    const adjustmentsApplied: StockMovement[] = [];

    // Aplicar ajustes automáticos a los items con discrepancia
    for (const itemRow of reconciledCount.items) {
      if (itemRow.difference === 0) continue;

      const item = await this.itemRepo.findById(itemRow.itemId);
      if (!item) continue;

      const movementId = `mov-count-${reconciledCount.id}-${item.id}`;
      const reason = `Ajuste automático por toma física '${reconciledCount.name}' (${itemRow.difference > 0 ? 'Sobrante' : 'Faltante'})`;

      const movement = item.adjustStock({
        movementId,
        warehouseId: reconciledCount.warehouseId,
        deltaQuantity: itemRow.difference,
        reason,
        unitCost: itemRow.unitCost,
        performedBy: request.reconciledBy,
        authorizedBy: request.authorizedBy,
        allowNegativeStock: true, // Durante toma física se ajusta a lo contado exactamente
      });

      await this.itemRepo.save(item);
      await this.movementRepo.save(movement);
      adjustmentsApplied.push(movement);
    }

    await this.countRepo.save(reconciledCount);

    return {
      count: reconciledCount,
      adjustmentsApplied,
    };
  }
}

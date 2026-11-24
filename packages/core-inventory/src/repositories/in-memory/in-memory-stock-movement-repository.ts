import { StockMovement } from '../../domain/entities/stock-movement.js';
import {
  IStockMovementRepository,
  KardexFilter,
  KardexQueryResult,
} from '../stock-movement-repository.interface.js';

export class InMemoryStockMovementRepository implements IStockMovementRepository {
  private readonly movements = new Map<string, StockMovement>();
  private readonly idempotencyIndex = new Map<string, string>(); // key -> movementId

  public async save(movement: StockMovement): Promise<void> {
    this.movements.set(movement.id, StockMovement.fromJSON(movement.toJSON()));
    if (movement.idempotencyKey) {
      this.idempotencyIndex.set(movement.idempotencyKey, movement.id);
    }
  }

  public async findById(id: string): Promise<StockMovement | null> {
    const mov = this.movements.get(id);
    if (!mov) return null;
    return StockMovement.fromJSON(mov.toJSON());
  }

  public async findByIdempotencyKey(key: string): Promise<StockMovement | null> {
    const movementId = this.idempotencyIndex.get(key);
    if (!movementId) return null;
    return this.findById(movementId);
  }

  public async listByItem(itemId: string): Promise<StockMovement[]> {
    return Array.from(this.movements.values())
      .filter((m) => m.itemId === itemId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => StockMovement.fromJSON(m.toJSON()));
  }

  public async listByWarehouse(warehouseId: string): Promise<StockMovement[]> {
    return Array.from(this.movements.values())
      .filter((m) => m.warehouseId === warehouseId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => StockMovement.fromJSON(m.toJSON()));
  }

  public async query(filter: KardexFilter): Promise<KardexQueryResult> {
    const filtered = Array.from(this.movements.values())
      .filter((m) => {
        if (filter.itemId && m.itemId !== filter.itemId) return false;
        if (filter.warehouseId && m.warehouseId !== filter.warehouseId) return false;
        if (filter.type && m.type !== filter.type) return false;
        if (filter.referenceId && m.referenceId !== filter.referenceId) return false;
        if (filter.fromDate && m.createdAt.getTime() < filter.fromDate.getTime()) return false;
        if (filter.toDate && m.createdAt.getTime() > filter.toDate.getTime()) return false;
        return true;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const total = filtered.length;
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = filter.limit !== undefined && filter.limit > 0 ? filter.limit : total;
    const sliced = filtered.slice(offset, offset + limit).map((m) => StockMovement.fromJSON(m.toJSON()));

    return {
      movements: sliced,
      total,
    };
  }
}

import { StockMovement, StockMovementType } from '../domain/entities/stock-movement.js';

export interface KardexFilter {
  itemId?: string;
  warehouseId?: string;
  type?: StockMovementType;
  referenceId?: string;
  fromDate?: Date;
  toDate?: Date;
  offset?: number;
  limit?: number;
}

export interface KardexQueryResult {
  movements: StockMovement[];
  total: number;
}

export interface IStockMovementRepository {
  save(movement: StockMovement): Promise<void>;
  findById(id: string): Promise<StockMovement | null>;
  findByIdempotencyKey(key: string): Promise<StockMovement | null>;
  listByItem(itemId: string): Promise<StockMovement[]>;
  listByWarehouse(warehouseId: string): Promise<StockMovement[]>;
  query?(filter: KardexFilter): Promise<KardexQueryResult>;
}

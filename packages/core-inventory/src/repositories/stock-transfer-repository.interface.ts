import { StockTransfer } from '../domain/entities/stock-transfer.js';

export interface IStockTransferRepository {
  findById(id: string): Promise<StockTransfer | null>;
  save(transfer: StockTransfer): Promise<void>;
  listPendingTransfers(warehouseId?: string): Promise<StockTransfer[]>;
  listAll(): Promise<StockTransfer[]>;
}

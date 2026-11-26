import { StockTransfer } from '../../domain/entities/stock-transfer.js';
import { IStockTransferRepository } from '../stock-transfer-repository.interface.js';

export class InMemoryStockTransferRepository implements IStockTransferRepository {
  private readonly transfers = new Map<string, StockTransfer>();

  public async findById(id: string): Promise<StockTransfer | null> {
    const tr = this.transfers.get(id);
    if (!tr) return null;
    return StockTransfer.fromJSON(tr.toJSON());
  }

  public async save(transfer: StockTransfer): Promise<void> {
    this.transfers.set(transfer.id, StockTransfer.fromJSON(transfer.toJSON()));
  }

  public async listPendingTransfers(warehouseId?: string): Promise<StockTransfer[]> {
    return Array.from(this.transfers.values())
      .filter((t) => {
        const isPending = t.status === 'IN_TRANSIT' || t.status === 'DRAFT';
        if (!isPending) return false;
        if (!warehouseId) return true;
        return t.toWarehouseId === warehouseId || t.fromWarehouseId === warehouseId;
      })
      .map((t) => StockTransfer.fromJSON(t.toJSON()));
  }

  public async listAll(): Promise<StockTransfer[]> {
    return Array.from(this.transfers.values()).map((t) => StockTransfer.fromJSON(t.toJSON()));
  }
}

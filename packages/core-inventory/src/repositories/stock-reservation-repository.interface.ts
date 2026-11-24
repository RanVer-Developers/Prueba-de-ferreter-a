import { StockReservation } from '../domain/entities/stock-reservation.js';

export interface IStockReservationRepository {
  save(reservation: StockReservation): Promise<void>;
  findById(id: string): Promise<StockReservation | null>;
  findByReferenceId(referenceId: string): Promise<StockReservation[]>;
  listActiveByItem(itemId: string, warehouseId?: string): Promise<StockReservation[]>;
  listExpired(referenceDate?: Date): Promise<StockReservation[]>;
}

import { StockReservation } from '../../domain/entities/stock-reservation.js';
import { IStockReservationRepository } from '../stock-reservation-repository.interface.js';

export class InMemoryStockReservationRepository implements IStockReservationRepository {
  private readonly reservations = new Map<string, StockReservation>();

  public async save(reservation: StockReservation): Promise<void> {
    this.reservations.set(reservation.id, StockReservation.fromJSON(reservation.toJSON()));
  }

  public async findById(id: string): Promise<StockReservation | null> {
    const res = this.reservations.get(id);
    if (!res) return null;
    return StockReservation.fromJSON(res.toJSON());
  }

  public async findByReferenceId(referenceId: string): Promise<StockReservation[]> {
    return Array.from(this.reservations.values())
      .filter((r) => r.referenceId === referenceId)
      .map((r) => StockReservation.fromJSON(r.toJSON()));
  }

  public async listActiveByItem(itemId: string, warehouseId?: string): Promise<StockReservation[]> {
    return Array.from(this.reservations.values())
      .filter(
        (r) =>
          r.status === 'ACTIVE' &&
          r.itemId === itemId &&
          (warehouseId === undefined || r.warehouseId === warehouseId)
      )
      .map((r) => StockReservation.fromJSON(r.toJSON()));
  }

  public async listExpired(referenceDate: Date = new Date()): Promise<StockReservation[]> {
    return Array.from(this.reservations.values())
      .filter((r) => r.status === 'ACTIVE' && r.isExpired(referenceDate))
      .map((r) => StockReservation.fromJSON(r.toJSON()));
  }
}

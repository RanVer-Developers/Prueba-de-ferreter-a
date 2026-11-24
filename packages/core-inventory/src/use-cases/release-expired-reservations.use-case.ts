import { StockReservation } from '../domain/entities/stock-reservation.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { StockReservationService } from '../domain/services/stock-reservation.service.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockReservationRepository } from '../repositories/stock-reservation-repository.interface.js';

export interface ReleaseExpiredReservationsRequest {
  referenceDate?: Date;
}

export interface ReleaseExpiredReservationsResponse {
  releasedCount: number;
  expiredReservations: StockReservation[];
}

export class ReleaseExpiredReservationsUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly reservationRepo: IStockReservationRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(
    request: ReleaseExpiredReservationsRequest = {}
  ): Promise<ReleaseExpiredReservationsResponse> {
    const referenceDate = request.referenceDate ?? new Date();
    const expired = await this.reservationRepo.listExpired(referenceDate);
    if (expired.length === 0) {
      return { releasedCount: 0, expiredReservations: [] };
    }

    // Agrupar por itemId para actualizar cada agregado una sola vez
    const byItem = new Map<string, StockReservation[]>();
    for (const res of expired) {
      const list = byItem.get(res.itemId) ?? [];
      list.push(res);
      byItem.set(res.itemId, list);
    }

    const allReleased: StockReservation[] = [];
    for (const [itemId, reservations] of byItem.entries()) {
      const item = await this.itemRepo.findById(itemId);
      if (!item) continue;

      const { expiredReservations, updatedItem } = StockReservationService.releaseExpiredReservations(
        item,
        reservations,
        referenceDate
      );

      await this.itemRepo.save(updatedItem);
      for (const exp of expiredReservations) {
        await this.reservationRepo.save(exp);
        allReleased.push(exp);
      }

      if (this.eventBus) {
        const events = updatedItem.pullDomainEvents();
        if (events.length > 0) await this.eventBus.publish(events);
      }
    }

    return {
      releasedCount: allReleased.length,
      expiredReservations: allReleased,
    };
  }
}

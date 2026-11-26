import { InventoryItem } from '../entities/inventory-item.js';
import { StockReservation } from '../entities/stock-reservation.js';

/**
 * Servicio de dominio para gestión y limpieza de reservas temporales de stock.
 */
export class StockReservationService {
  /**
   * Revisa una lista de reservas asociadas a un item, expira las que hayan superado el TTL
   * y libera la cantidad retenida en el InventoryItem.
   */
  public static releaseExpiredReservations(
    item: InventoryItem,
    reservations: StockReservation[],
    referenceDate: Date = new Date()
  ): { expiredReservations: StockReservation[]; updatedItem: InventoryItem } {
    const expiredList: StockReservation[] = [];

    for (const res of reservations) {
      if (res.status === 'ACTIVE' && res.isExpired(referenceDate)) {
        const expiredRes = res.expire();
        expiredList.push(expiredRes);
        item.releaseReservation({
          warehouseId: res.warehouseId,
          quantity: res.quantity,
          reservationId: res.id,
          serialNumbers: res.serialNumbers,
        });
      }
    }

    return {
      expiredReservations: expiredList,
      updatedItem: item,
    };
  }
}

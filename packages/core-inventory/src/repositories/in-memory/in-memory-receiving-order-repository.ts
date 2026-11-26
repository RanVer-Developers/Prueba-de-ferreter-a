import { ReceivingOrder } from '../../domain/entities/receiving-order.js';
import { IReceivingOrderRepository } from '../receiving-order-repository.interface.js';

export class InMemoryReceivingOrderRepository implements IReceivingOrderRepository {
  private readonly orders = new Map<string, ReceivingOrder>();

  public async findById(id: string): Promise<ReceivingOrder | null> {
    const o = this.orders.get(id);
    if (!o) return null;
    return ReceivingOrder.fromJSON(o.toJSON());
  }

  public async findByOrderNumber(orderNumber: string): Promise<ReceivingOrder | null> {
    const cleanNum = orderNumber.trim().toUpperCase();
    for (const o of this.orders.values()) {
      if (o.orderNumber.toUpperCase() === cleanNum) {
        return ReceivingOrder.fromJSON(o.toJSON());
      }
    }
    return null;
  }

  public async save(order: ReceivingOrder): Promise<void> {
    this.orders.set(order.id, ReceivingOrder.fromJSON(order.toJSON()));
  }

  public async listPendingByWarehouse(warehouseId: string): Promise<ReceivingOrder[]> {
    return Array.from(this.orders.values())
      .filter(
        (o) =>
          o.warehouseId === warehouseId &&
          (o.status === 'APPROVED' || o.status === 'PARTIALLY_RECEIVED')
      )
      .map((o) => ReceivingOrder.fromJSON(o.toJSON()));
  }

  public async listAll(): Promise<ReceivingOrder[]> {
    return Array.from(this.orders.values()).map((o) => ReceivingOrder.fromJSON(o.toJSON()));
  }
}

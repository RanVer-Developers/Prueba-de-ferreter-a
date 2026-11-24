import { ReceivingOrder } from '../domain/entities/receiving-order.js';

export interface IReceivingOrderRepository {
  findById(id: string): Promise<ReceivingOrder | null>;
  findByOrderNumber(orderNumber: string): Promise<ReceivingOrder | null>;
  save(order: ReceivingOrder): Promise<void>;
  listPendingByWarehouse(warehouseId: string): Promise<ReceivingOrder[]>;
  listAll(): Promise<ReceivingOrder[]>;
}

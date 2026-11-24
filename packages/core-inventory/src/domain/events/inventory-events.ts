/**
 * Interfaz base de eventos de dominio de inventario.
 */
export interface InventoryDomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventName: string;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: T;
}

export interface StockReceivedPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly unitCostCents: number;
  readonly currency: string;
  readonly newOnHandStock: number;
  readonly referenceId?: string;
  readonly lotNumber?: string;
}

export interface StockDispatchedPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly totalCostCents: number;
  readonly currency: string;
  readonly remainingOnHandStock: number;
  readonly referenceId?: string;
  readonly lotNumber?: string;
  readonly serialNumbers?: string[];
}

export interface StockTransferredPayload {
  readonly transferId: string;
  readonly itemId: string;
  readonly fromWarehouseId: string;
  readonly toWarehouseId: string;
  readonly quantitySent: number;
  readonly quantityReceived: number;
  readonly status: 'IN_TRANSIT' | 'COMPLETED' | 'DISCREPANCY' | 'CANCELLED';
}

export interface StockAdjustedPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly deltaQuantity: number;
  readonly reason: string;
  readonly previousStock: number;
  readonly newStock: number;
  readonly performedBy: string;
  readonly authorizedBy?: string;
}

export interface StockReservedPayload {
  readonly reservationId: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly referenceId: string;
  readonly expiresAt: Date;
}

export interface ReservationReleasedPayload {
  readonly reservationId: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly reason: 'EXPIRED' | 'CANCELLED' | 'MANUAL';
}

export interface ReservationCommittedPayload {
  readonly reservationId: string;
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly referenceId: string;
}

export interface LowStockAlertPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly currentAvailable: number;
  readonly minStock: number;
  readonly reorderPoint: number;
}

export interface OutOfStockAlertPayload {
  readonly itemId: string;
  readonly warehouseId: string;
}

export interface LotExpiringSoonPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly lotNumber: string;
  readonly expirationDate: Date;
  readonly remainingQuantity: number;
  readonly daysUntilExpiration: number;
}

export interface InventoryCountReconciledPayload {
  readonly countId: string;
  readonly warehouseId: string;
  readonly totalItemsCounted: number;
  readonly totalDiscrepancies: number;
  readonly netValueAdjustmentCents: number;
  readonly reconciledBy: string;
}

export interface CustomerReturnProcessedPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly destination: 'RESTOCK' | 'QUARANTINE' | 'DAMAGED_WRITE_OFF';
  readonly referenceId: string;
}

export interface SupplierReturnProcessedPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly quantity: number;
  readonly reason: string;
  readonly lotNumber?: string;
  readonly serialNumbers?: string[];
}

export interface ReceivingOrderUpdatedPayload {
  readonly orderId: string;
  readonly warehouseId: string;
  readonly status: 'PARTIALLY_RECEIVED' | 'COMPLETED' | 'CANCELLED';
  readonly lastReceivedItemId?: string;
  readonly lastReceivedQuantity?: number;
}

export interface PackBrokenPayload {
  readonly warehouseId: string;
  readonly parentItemId: string;
  readonly parentQuantityDeducted: number;
  readonly childItemId: string;
  readonly childQuantityCreated: number;
}

export interface LotQuarantinedPayload {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly lotNumber: string;
  readonly status: 'QUARANTINED' | 'ACTIVE' | 'EXPIRED';
  readonly reason?: string;
}

/**
 * Puerto opcional para publicación de eventos de dominio hacia la capa de aplicación / outbox.
 */
export interface IInventoryEventBus {
  publish(events: InventoryDomainEvent[]): Promise<void>;
}

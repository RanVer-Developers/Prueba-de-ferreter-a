import type { PurchasingDomainEvent } from '../domain/events/purchasing-events.js';
import type { CostUpdateStrategy } from '../domain/services/purchasing-features.js';

export interface InventoryReceivingLineInput {
  productId: string;
  /** Quantity in base inventory units (acceptedQuantity * packSize) */
  quantity: number;
  /** Net unit cost per base inventory unit in cents */
  unitCostCents: number;
  currency: string;
  lotNumber?: string;
  expirationDate?: string;
}

export interface InventoryReceivingPortInput {
  receiptId: string;
  receiptNumber: string;
  purchaseOrderId?: string;
  supplierId: string;
  warehouseId: string;
  invoiceNumber?: string;
  receivedBy?: string;
  receivedAt: string;
  lines: ReadonlyArray<InventoryReceivingLineInput>;
}

/**
 * Decoupled port implemented by the host application to forward received goods
 * into @modulos/core-inventory without coupling core-purchasing to core-inventory.
 */
export interface IInventoryReceivingPort {
  receivePurchaseStock(input: InventoryReceivingPortInput): Promise<void>;
}

export interface InventoryReturnLineInput {
  productId: string;
  quantity: number;
  unitCostCents: number;
  reason: string;
  lotNumber?: string;
}

export interface InventoryReturnPortInput {
  returnId: string;
  returnNumber: string;
  supplierId: string;
  warehouseId: string;
  receiptId?: string;
  createdBy?: string;
  returnedAt: string;
  lines: ReadonlyArray<InventoryReturnLineInput>;
}

/**
 * Decoupled port implemented by the host application to deduct returned goods
 * in @modulos/core-inventory.
 */
export interface IInventoryReturnPort {
  recordSupplierReturnStock(input: InventoryReturnPortInput): Promise<void>;
}

export interface CatalogCostUpdateInput {
  productId: string;
  supplierId: string;
  /** Net cost per single base inventory unit in cents */
  newUnitCostCents: number;
  /** Quantity received in base inventory units (used for weighted average if needed) */
  receivedBaseUnits: number;
  currency: string;
  strategy: CostUpdateStrategy;
  receiptId: string;
  updatedAt: string;
}

/**
 * Decoupled port implemented by the host application to update product purchase costs
 * in @modulos/core-catalog.
 */
export interface ICatalogCostUpdaterPort {
  updateProductCost(input: CatalogCostUpdateInput): Promise<void>;
}

export interface IPurchasingEventBus {
  publish(event: PurchasingDomainEvent): Promise<void> | void;
}

export interface IPurchasingClock {
  now(): Date;
}

export class SystemPurchasingClock implements IPurchasingClock {
  now(): Date {
    return new Date();
  }
}

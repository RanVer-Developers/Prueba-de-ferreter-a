import type { FerreAguilarRoleCode } from '@ferre-aguilar/core';

export interface StaffRecord {
  id: string;
  displayName: string;
  roleCode: FerreAguilarRoleCode;
  pinHash: string;
  active: boolean;
}

export interface ProductRecord {
  id: string; // sku
  name: string;
  unit: string;
  priceCents: number;
  costCents: number;
  minStock: number;
  stock: number;
}

export type PaymentKind = 'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER';

export interface TicketItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
}

export interface TicketRecord {
  id: string;
  at: string;
  shiftId: string;
  cashierId: string;
  cashierName: string;
  items: TicketItem[];
  totalCents: number;
  method: PaymentKind;
  tenderedCents: number;
  changeCents: number;
  status: 'COMPLETED' | 'VOIDED';
  voidReason?: string;
}

export interface ShiftRecord {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  initialCents: number;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string;
  declaredCents?: number;
  expectedCents?: number;
}

export interface MovementRecord {
  id: string;
  shiftId: string;
  at: string;
  kind: 'IN' | 'OUT';
  amountCents: number;
  concept: string;
  byName: string;
}

export interface PurchaseRecord {
  id: string;
  at: string;
  supplier: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCostCents: number;
  byName: string;
}

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'SALE'
  | 'VOID_SALE'
  | 'SHIFT_OPEN'
  | 'SHIFT_CLOSE'
  | 'CASH_MOVEMENT'
  | 'STOCK_ADJUST'
  | 'PURCHASE'
  | 'PRODUCT_CREATE'
  | 'DENIED';

export interface AuditRecord {
  id: string;
  at: string;
  userName: string;
  action: AuditAction;
  detail: string;
  risk: 'normal' | 'alert';
}

export interface ErrorRecord {
  id: string;
  at: string;
  screen: string;
  action: string;
  detail: string;
}

export interface Collections {
  staff: StaffRecord;
  products: ProductRecord;
  tickets: TicketRecord;
  shifts: ShiftRecord;
  movements: MovementRecord;
  purchases: PurchaseRecord;
  audit: AuditRecord;
  errors: ErrorRecord;
}
export type CollectionName = keyof Collections;
export const COLLECTION_NAMES: CollectionName[] = [
  'staff', 'products', 'tickets', 'shifts', 'movements', 'purchases', 'audit', 'errors',
];

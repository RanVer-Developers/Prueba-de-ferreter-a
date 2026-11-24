export type UserRole =
  | "owner"
  | "manager"
  | "cashier"
  | "seller"
  | "warehouse"
  | "driver";

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Dueño",
  manager: "Encargado",
  cashier: "Cajera",
  seller: "Vendedor",
  warehouse: "Bodeguero",
  driver: "Chofer",
};

export interface FerreUser {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  active: boolean;
}

export interface FerreProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  costCents: number;
  priceCents: number;
  stock: number;
  minStock: number;
  active: boolean;
}

export interface FerreSupplier {
  id: string;
  name: string;
  phone: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  subtotalCents: number;
}

export interface ParkedOrder {
  id: string;
  label: string;
  createdBy: string;
  createdAt: string;
  items: CartItem[];
  totalCents: number;
}

export type PaymentMethod = "cash" | "card" | "transfer";

export interface FerreSale {
  id: string;
  folio: number;
  shiftId: string;
  items: CartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  cashReceivedCents: number;
  changeCents: number;
  status: "completed" | "cancelled";
  createdByUserId: string;
  createdByUserName: string;
  cancelledByUserName?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface CashMovement {
  id: string;
  type: "deposit" | "withdrawal";
  amountCents: number;
  reason: string;
  userName: string;
  createdAt: string;
}

export interface CashShift {
  id: string;
  openedByUserId: string;
  openedByUserName: string;
  openedAt: string;
  openingFloatCents: number;
  status: "open" | "closed";
  movements: CashMovement[];
  closedByUserName?: string;
  closedAt?: string;
  expectedCashCents?: number;
  countedCashCents?: number;
  differenceCents?: number;
}

export interface PurchaseRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitCostCents: number;
  }>;
  totalCents: number;
  userName: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action:
    | "sale_cancelled"
    | "discount_applied"
    | "cash_movement"
    | "cash_shift_closed_diff"
    | "inventory_adjusted"
    | "purchase_received"
    | "user_updated";
  userName: string;
  userRole: UserRole;
  details: string;
  createdAt: string;
}

export interface FerreState {
  schemaVersion: 1;
  nextFolio: number;
  users: FerreUser[];
  products: FerreProduct[];
  suppliers: FerreSupplier[];
  shifts: CashShift[];
  sales: FerreSale[];
  parkedOrders: ParkedOrder[];
  purchases: PurchaseRecord[];
  auditLog: AuditEntry[];
}

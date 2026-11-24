import {
  resolveAuthRbacFeatures,
} from "@modulos/core-auth-rbac";
import {
  resolveCashierFeatures,
} from "@modulos/core-cashier";
import {
  resolveCatalogFeatures,
} from "@modulos/core-catalog";
import {
  resolveInventoryFeatures,
} from "@modulos/core-inventory";
import {
  resolveOrderFeatures,
} from "@modulos/core-orders";
import {
  resolvePurchasingFeatures,
} from "@modulos/core-purchasing";
import {
  resolveReportFeatureFlags,
} from "@modulos/core-reports";
import {
  Money,
  decimalToCentsHalfEven,
  generateId,
  multiplyCentsHalfEven,
} from "@modulos/core-shared";
import type {
  AuditEntry,
  CashShift,
  FerreProduct,
  FerreState,
  FerreUser,
  UserRole,
} from "./ferre-types.js";

const STORAGE_KEY = "ferre_alfredo_state_v1";

/**
 * Perfiles activos de los módulos reutilizables @modulos/* para Ferre Alfredo V1.
 * Si el cliente solicita una función de nivel superior, se habilita aquí primero.
 */
export const ACTIVE_MODULE_PROFILES = {
  auth: resolveAuthRbacFeatures("INTERMEDIATE"),
  catalog: resolveCatalogFeatures({ multiBarcodeLookup: true }),
  orders: resolveOrderFeatures({ parkedOrders: true, lineDiscounts: true }),
  cashier: resolveCashierFeatures("INTERMEDIATE"),
  inventory: resolveInventoryFeatures("INTERMEDIATE"),
  purchasing: resolvePurchasingFeatures("BASIC"),
  reports: resolveReportFeatureFlags("INTERMEDIATE"),
} as const;

export function formatMXN(cents: number): string {
  const safeCents = Math.round(cents);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function pesosToCents(pesos: number): number {
  if (!Number.isFinite(pesos)) return 0;
  return decimalToCentsHalfEven(pesos, "MXN");
}

export function multiplyCents(unitCents: number, quantity: number): number {
  return multiplyCentsHalfEven(Math.round(unitCents), quantity);
}

export function addCents(a: number, b: number): number {
  return Money.fromCents(Math.round(a), "MXN")
    .add(Money.fromCents(Math.round(b), "MXN"))
    .toCents();
}

export function subtractCents(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}

export const ROLE_PERMISSIONS: Record<
  UserRole,
  {
    canSell: boolean;
    canCollect: boolean;
    canOpenCloseShift: boolean;
    canCashMovement: boolean;
    canApplyDiscount: boolean;
    canCancelSale: boolean;
    canManageInventory: boolean;
    canReceivePurchase: boolean;
    canViewReports: boolean;
    canViewAudit: boolean;
    canManageUsers: boolean;
  }
> = {
  owner: {
    canSell: true,
    canCollect: true,
    canOpenCloseShift: true,
    canCashMovement: true,
    canApplyDiscount: true,
    canCancelSale: true,
    canManageInventory: true,
    canReceivePurchase: true,
    canViewReports: true,
    canViewAudit: true,
    canManageUsers: true,
  },
  manager: {
    canSell: true,
    canCollect: true,
    canOpenCloseShift: true,
    canCashMovement: true,
    canApplyDiscount: true,
    canCancelSale: true,
    canManageInventory: true,
    canReceivePurchase: true,
    canViewReports: true,
    canViewAudit: true,
    canManageUsers: false,
  },
  cashier: {
    canSell: true,
    canCollect: true,
    canOpenCloseShift: true,
    canCashMovement: true,
    canApplyDiscount: false,
    canCancelSale: false,
    canManageInventory: false,
    canReceivePurchase: false,
    canViewReports: false,
    canViewAudit: false,
    canManageUsers: false,
  },
  seller: {
    canSell: true,
    canCollect: false,
    canOpenCloseShift: false,
    canCashMovement: false,
    canApplyDiscount: false,
    canCancelSale: false,
    canManageInventory: false,
    canReceivePurchase: false,
    canViewReports: false,
    canViewAudit: false,
    canManageUsers: false,
  },
  warehouse: {
    canSell: false,
    canCollect: false,
    canOpenCloseShift: false,
    canCashMovement: false,
    canApplyDiscount: false,
    canCancelSale: false,
    canManageInventory: true,
    canReceivePurchase: true,
    canViewReports: false,
    canViewAudit: false,
    canManageUsers: false,
  },
  driver: {
    canSell: false,
    canCollect: false,
    canOpenCloseShift: false,
    canCashMovement: false,
    canApplyDiscount: false,
    canCancelSale: false,
    canManageInventory: false,
    canReceivePurchase: false,
    canViewReports: false,
    canViewAudit: false,
    canManageUsers: false,
  },
};

export function createSeedState(): FerreState {
  const users: FerreUser[] = [
    { id: "u-owner", name: "Don Alfredo", role: "owner", pin: "1111", active: true },
    { id: "u-manager", name: "Jorge (Encargado)", role: "manager", pin: "2222", active: true },
    { id: "u-cashier", name: "Lupita (Cajera)", role: "cashier", pin: "3333", active: true },
    { id: "u-seller", name: "Carlos (Vendedor)", role: "seller", pin: "4444", active: true },
    { id: "u-warehouse", name: "Pedro (Bodega)", role: "warehouse", pin: "5555", active: true },
    { id: "u-driver", name: "Mateo (Chofer)", role: "driver", pin: "6666", active: true },
  ];

  const products: FerreProduct[] = [
    {
      id: "p-1",
      sku: "MAR-16",
      barcode: "750100100001",
      name: "Martillo de uña 16 oz Truper",
      category: "Herramientas",
      unit: "pieza",
      costCents: 11000,
      priceCents: 16500,
      stock: 18,
      minStock: 5,
      active: true,
    },
    {
      id: "p-2",
      sku: "CAB-12",
      barcode: "750100100002",
      name: "Cable eléctrico calibre 12 AWG",
      category: "Eléctrico",
      unit: "metro",
      costCents: 1400,
      priceCents: 2250,
      stock: 85,
      minStock: 30,
      active: true,
    },
    {
      id: "p-3",
      sku: "CEM-50",
      barcode: "750100100003",
      name: "Cemento gris 50 kg",
      category: "Construcción",
      unit: "bulto",
      costCents: 19500,
      priceCents: 24500,
      stock: 42,
      minStock: 15,
      active: true,
    },
    {
      id: "p-4",
      sku: "PVC-12",
      barcode: "750100100004",
      name: "Tubo PVC hidráulico 1/2 pulgada (6m)",
      category: "Plomería",
      unit: "pieza",
      costCents: 6800,
      priceCents: 10500,
      stock: 9,
      minStock: 10,
      active: true,
    },
    {
      id: "p-5",
      sku: "CLV-25",
      barcode: "750100100005",
      name: "Clavo estándar 2.5 pulgadas",
      category: "Fijación",
      unit: "kilo",
      costCents: 4200,
      priceCents: 6800,
      stock: 25,
      minStock: 8,
      active: true,
    },
    {
      id: "p-6",
      sku: "PIN-19",
      barcode: "750100100006",
      name: "Pintura vinílica blanca cubeta 19L",
      category: "Pinturas",
      unit: "cubeta",
      costCents: 89000,
      priceCents: 129000,
      stock: 6,
      minStock: 4,
      active: true,
    },
    {
      id: "p-7",
      sku: "DES-06",
      barcode: "750100100007",
      name: "Juego de 6 desarmadores mango comfort",
      category: "Herramientas",
      unit: "juego",
      costCents: 14500,
      priceCents: 22900,
      stock: 7,
      minStock: 4,
      active: true,
    },
    {
      id: "p-8",
      sku: "CIN-AIS",
      barcode: "750100100008",
      name: "Cinta aislante negra 18m",
      category: "Eléctrico",
      unit: "pieza",
      costCents: 1200,
      priceCents: 2400,
      stock: 3,
      minStock: 12,
      active: true,
    },
    {
      id: "p-9",
      sku: "STI-14",
      barcode: "750100100009",
      name: "Llave Stilson 14 pulgadas uso rudo",
      category: "Plomería",
      unit: "pieza",
      costCents: 21000,
      priceCents: 31500,
      stock: 5,
      minStock: 3,
      active: true,
    },
    {
      id: "p-10",
      sku: "LED-12",
      barcode: "750100100010",
      name: "Foco LED 12W luz fría",
      category: "Eléctrico",
      unit: "pieza",
      costCents: 2200,
      priceCents: 4200,
      stock: 34,
      minStock: 10,
      active: true,
    },
  ];

  return {
    schemaVersion: 1,
    nextFolio: 101,
    users,
    products,
    suppliers: [
      { id: "sup-1", name: "Distribuidora Truper Centro", phone: "55-1234-5678" },
      { id: "sup-2", name: "Materiales y Cementos del Norte", phone: "55-8765-4321" },
      { id: "sup-3", name: "Eléctrica Industrial del Bajío", phone: "55-4455-6677" },
    ],
    shifts: [],
    sales: [],
    parkedOrders: [],
    purchases: [],
    auditLog: [],
  };
}

export function loadFerreState(): FerreState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedState();
      saveFerreState(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as FerreState;
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.users)) {
      const seed = createSeedState();
      saveFerreState(seed);
      return seed;
    }
    return parsed;
  } catch {
    return createSeedState();
  }
}

export function saveFerreState(state: FerreState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function createAuditEntry(
  action: AuditEntry["action"],
  user: FerreUser,
  details: string
): AuditEntry {
  return {
    id: generateId(),
    action,
    userName: user.name,
    userRole: user.role,
    details,
    createdAt: new Date().toISOString(),
  };
}

export function getOpenShift(shifts: CashShift[]): CashShift | undefined {
  return shifts.find((s) => s.status === "open");
}

export function computeShiftExpectedCash(
  shift: CashShift,
  sales: FerreState["sales"]
): number {
  const cashSales = sales
    .filter(
      (s) =>
        s.shiftId === shift.id &&
        s.status === "completed" &&
        s.paymentMethod === "cash"
    )
    .reduce((acc, s) => addCents(acc, s.totalCents), 0);

  const movementsNet = shift.movements.reduce((acc, m) => {
    return m.type === "deposit"
      ? addCents(acc, m.amountCents)
      : subtractCents(acc, m.amountCents);
  }, 0);

  return addCents(addCents(shift.openingFloatCents, cashSales), movementsNet);
}

export function searchProductsFast(
  products: FerreProduct[],
  query: string
): FerreProduct[] {
  const active = products.filter((p) => p.active);
  const norm = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const q = norm(query);
  if (!q) return active;

  const exact = active.filter(
    (p) => norm(p.barcode) === q || norm(p.sku) === q
  );
  if (exact.length > 0) return exact;

  const tokens = q.split(/\s+/).filter(Boolean);
  return active.filter((p) => {
    const haystack = norm(`${p.barcode} ${p.sku} ${p.name} ${p.category}`);
    return tokens.every((t) => haystack.includes(t));
  });
}

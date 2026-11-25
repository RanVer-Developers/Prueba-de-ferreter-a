import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calculator,
  LifeBuoy,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  UserCheck,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { generateId } from "@modulos/core-shared";
import { CashierView } from "./components/CashierView.js";
import { CustomersView } from "./components/CustomersView.js";
import { InventoryPurchasingView } from "./components/InventoryPurchasingView.js";
import { PinLoginScreen } from "./components/PinLoginScreen.js";
import { PosView, buildParkedOrder } from "./components/PosView.js";
import { ReportsAuditView } from "./components/ReportsAuditView.js";
import { SettingsView } from "./components/SettingsView.js";
import { UsersSupportModal } from "./components/UsersSupportModal.js";
import {
  addCents,
  computeShiftExpectedCash,
  createAuditEntry,
  formatMXN,
  getOpenShift,
  loadFerreState,
  multiplyCents,
  saveFerreState,
  subtractCents,
} from "./core/ferre-store.js";
import {
  ROLE_LABELS,
  type BusinessSettings,
  type CartItem,
  type FerreCustomer,
  type FerreProduct,
  type FerreState,
  type FerreSupplier,
  type FerreUser,
  type PaymentMethod,
} from "./core/ferre-types.js";

type ActiveTab =
  | "pos"
  | "cashier"
  | "customers"
  | "inventory"
  | "reports"
  | "settings";

export function App() {
  const [state, setState] = useState<FerreState>(() => loadFerreState());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("pos");
  const [supportOpen, setSupportOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

  useEffect(() => {
    saveFerreState(state);
  }, [state]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === currentUserId) ?? null,
    [state.users, currentUserId]
  );

  const openShift = useMemo(
    () => getOpenShift(state.shifts),
    [state.shifts]
  );

  if (!currentUser) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <PinLoginScreen
          users={state.users}
          onLogin={(user) => {
            setCurrentUserId(user.id);
            const perms = user.permissions;
            if (perms.canSell) setActiveTab("pos");
            else if (perms.canManageInventory) setActiveTab("inventory");
            else if (perms.canManageSettings || perms.canManageUsers)
              setActiveTab("settings");
            else setActiveTab("pos");
          }}
        />
      </>
    );
  }

  const perms = currentUser.permissions;

  const handleCompleteSale = (payload: {
    customerId?: string;
    customerName?: string;
    items: CartItem[];
    discountCents: number;
    paymentMethod: PaymentMethod;
    cashReceivedCents: number;
    authorizedBy?: FerreUser;
  }) => {
    if (!openShift) return;
    const subtotalCents = payload.items.reduce(
      (acc, i) => addCents(acc, i.subtotalCents),
      0
    );
    const totalCents = subtractCents(subtotalCents, payload.discountCents);
    const changeCents =
      payload.paymentMethod === "cash"
        ? subtractCents(payload.cashReceivedCents, totalCents)
        : 0;

    const saleId = generateId();
    const folio = state.nextFolio;
    const nowIso = new Date().toISOString();

    setState((prev) => {
      const nextProducts = prev.products.map((p) => {
        const sold = payload.items.find((i) => i.productId === p.id);
        return sold
          ? { ...p, stock: Number((p.stock - sold.quantity).toFixed(3)) }
          : p;
      });

      const nextCustomers =
        payload.paymentMethod === "credit" && payload.customerId
          ? prev.customers.map((c) =>
              c.id === payload.customerId
                ? {
                    ...c,
                    creditBalanceCents: addCents(
                      c.creditBalanceCents,
                      totalCents
                    ),
                    ledger: [
                      {
                        id: generateId(),
                        type: "charge" as const,
                        amountCents: totalCents,
                        reference: `Venta a crédito Folio #${folio}`,
                        userName: currentUser.name,
                        createdAt: nowIso,
                      },
                      ...c.ledger,
                    ],
                  }
                : c
            )
          : prev.customers;

      const nextAudit = [...prev.auditLog];
      if (payload.discountCents > 0) {
        const authUser = payload.authorizedBy ?? currentUser;
        nextAudit.unshift(
          createAuditEntry(
            "discount_applied",
            authUser,
            `Descuento de ${formatMXN(payload.discountCents)} aplicado en folio #${folio} (cobró ${currentUser.name}).`
          )
        );
      }

      return {
        ...prev,
        nextFolio: prev.nextFolio + 1,
        products: nextProducts,
        customers: nextCustomers,
        sales: [
          {
            id: saleId,
            folio,
            shiftId: openShift.id,
            customerId: payload.customerId,
            customerName: payload.customerName,
            items: payload.items,
            subtotalCents,
            discountCents: payload.discountCents,
            totalCents,
            paymentMethod: payload.paymentMethod,
            cashReceivedCents: payload.cashReceivedCents,
            changeCents,
            status: "completed",
            createdByUserId: currentUser.id,
            createdByUserName: currentUser.name,
            createdAt: nowIso,
          },
          ...prev.sales,
        ],
        auditLog: nextAudit,
      };
    });

    toast.success(
      payload.paymentMethod === "cash"
        ? `Cobro #${folio} registrado — Cambio: ${formatMXN(changeCents)}`
        : payload.paymentMethod === "credit"
          ? `Venta #${folio} cargada a crédito de ${payload.customerName ?? "cliente"}`
          : `Cobro #${folio} registrado correctamente`
    );
  };

  const handleParkOrder = (label: string, items: CartItem[]) => {
    const order = buildParkedOrder(label, items, currentUser.name);
    setState((prev) => ({
      ...prev,
      parkedOrders: [order, ...prev.parkedOrders],
    }));
  };

  const handleResumeParkedOrder = (orderId: string) => {
    const found = state.parkedOrders.find((o) => o.id === orderId);
    if (!found) return undefined;
    setState((prev) => ({
      ...prev,
      parkedOrders: prev.parkedOrders.filter((o) => o.id !== orderId),
    }));
    return found;
  };

  const handleOpenShift = (openingFloatCents: number) => {
    setState((prev) => ({
      ...prev,
      shifts: [
        {
          id: generateId(),
          openedByUserId: currentUser.id,
          openedByUserName: currentUser.name,
          openedAt: new Date().toISOString(),
          openingFloatCents,
          status: "open",
          movements: [],
        },
        ...prev.shifts,
      ],
    }));
  };

  const handleAddMovement = (
    type: "deposit" | "withdrawal",
    amountCents: number,
    reason: string
  ) => {
    if (!openShift) return;
    setState((prev) => ({
      ...prev,
      shifts: prev.shifts.map((s) =>
        s.id === openShift.id
          ? {
              ...s,
              movements: [
                ...s.movements,
                {
                  id: generateId(),
                  type,
                  amountCents,
                  reason,
                  userName: currentUser.name,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : s
      ),
      auditLog: [
        createAuditEntry(
          "cash_movement",
          currentUser,
          `${type === "deposit" ? "Entrada" : "Retiro"} en caja por ${formatMXN(amountCents)}. Motivo: ${reason}`
        ),
        ...prev.auditLog,
      ],
    }));
  };

  const handleCloseShift = (countedCashCents: number) => {
    if (!openShift) return;
    const expectedCashCents = computeShiftExpectedCash(openShift, state.sales);
    const differenceCents = subtractCents(countedCashCents, expectedCashCents);

    setState((prev) => {
      const nextAudit = [...prev.auditLog];
      if (
        Math.abs(differenceCents) >
        prev.settings.cashDiscrepancyToleranceCents
      ) {
        nextAudit.unshift(
          createAuditEntry(
            "cash_shift_closed_diff",
            currentUser,
            `Corte cerrado con diferencia de ${formatMXN(differenceCents)} (Esperado: ${formatMXN(expectedCashCents)}, Contado: ${formatMXN(countedCashCents)}).`
          )
        );
      }
      return {
        ...prev,
        shifts: prev.shifts.map((s) =>
          s.id === openShift.id
            ? {
                ...s,
                status: "closed",
                closedByUserName: currentUser.name,
                closedAt: new Date().toISOString(),
                expectedCashCents,
                countedCashCents,
                differenceCents,
              }
            : s
        ),
        auditLog: nextAudit,
      };
    });

    toast.success(
      differenceCents === 0
        ? "Corte de caja exacto. Turno cerrado."
        : `Corte cerrado con diferencia de ${formatMXN(differenceCents)}.`
    );
  };

  const handleCancelSale = (
    saleId: string,
    reason: string,
    supervisor: FerreUser
  ) => {
    const sale = state.sales.find((s) => s.id === saleId);
    if (!sale || sale.status === "cancelled") return;

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        const line = sale.items.find((i) => i.productId === p.id);
        return line
          ? { ...p, stock: Number((p.stock + line.quantity).toFixed(3)) }
          : p;
      }),
      customers:
        sale.paymentMethod === "credit" && sale.customerId
          ? prev.customers.map((c) =>
              c.id === sale.customerId
                ? {
                    ...c,
                    creditBalanceCents: Math.max(
                      0,
                      subtractCents(c.creditBalanceCents, sale.totalCents)
                    ),
                    ledger: [
                      {
                        id: generateId(),
                        type: "refund_credit" as const,
                        amountCents: sale.totalCents,
                        reference: `Cancelación Folio #${sale.folio}`,
                        userName: supervisor.name,
                        createdAt: new Date().toISOString(),
                      },
                      ...c.ledger,
                    ],
                  }
                : c
            )
          : prev.customers,
      sales: prev.sales.map((s) =>
        s.id === saleId
          ? {
              ...s,
              status: "cancelled",
              cancelledByUserName: supervisor.name,
              cancelReason: reason,
            }
          : s
      ),
      auditLog: [
        createAuditEntry(
          "sale_cancelled",
          supervisor,
          `Venta folio #${sale.folio} (${formatMXN(sale.totalCents)}) cancelada. Motivo: ${reason}`
        ),
        ...prev.auditLog,
      ],
    }));

    toast.success(`Venta #${sale.folio} cancelada y mercancía devuelta al stock.`);
  };

  const handleAdjustStock = (
    productId: string,
    delta: number,
    reason: string
  ) => {
    const prod = state.products.find((p) => p.id === productId);
    if (!prod) return;
    const nextStock = Number((prod.stock + delta).toFixed(3));
    if (nextStock < 0) {
      toast.error("El ajuste dejaría el inventario en negativo.");
      return;
    }

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId ? { ...p, stock: nextStock } : p
      ),
      auditLog: [
        createAuditEntry(
          "inventory_adjusted",
          currentUser,
          `Ajuste de ${delta > 0 ? `+${delta}` : delta} ${prod.unit} en "${prod.name}". Motivo: ${reason}`
        ),
        ...prev.auditLog,
      ],
    }));
    toast.success("Inventario actualizado y registrado en bitácora.");
  };

  const handleSaveProduct = (product: FerreProduct, isNew: boolean) => {
    setState((prev) => ({
      ...prev,
      products: isNew
        ? [product, ...prev.products]
        : prev.products.map((p) => (p.id === product.id ? product : p)),
      auditLog: [
        createAuditEntry(
          "product_updated",
          currentUser,
          `${isNew ? "Alta" : "Edición"} de producto "${product.name}" (${product.sku}) — Precio: ${formatMXN(product.priceCents)}.`
        ),
        ...prev.auditLog,
      ],
    }));
    toast.success(isNew ? "Producto agregado." : "Producto actualizado.");
  };

  const handleAddSupplier = (supplier: FerreSupplier) => {
    setState((prev) => ({
      ...prev,
      suppliers: [...prev.suppliers, supplier],
    }));
  };

  const handleReceivePurchase = (payload: {
    supplierId: string;
    productId: string;
    quantity: number;
    unitCostCents: number;
  }) => {
    const sup = state.suppliers.find((s) => s.id === payload.supplierId);
    const prod = state.products.find((p) => p.id === payload.productId);
    if (!sup || !prod) return;

    const totalCents = multiplyCents(payload.unitCostCents, payload.quantity);
    const nextStock = Number((prod.stock + payload.quantity).toFixed(3));
    const nextCostCents =
      state.settings.inventoryValuation === "CMP" && nextStock > 0
        ? Math.round(
            (prod.stock * prod.costCents +
              payload.quantity * payload.unitCostCents) /
              nextStock
          )
        : payload.unitCostCents;

    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === prod.id
          ? {
              ...p,
              stock: nextStock,
              costCents: nextCostCents,
            }
          : p
      ),
      purchases: [
        {
          id: generateId(),
          supplierId: sup.id,
          supplierName: sup.name,
          items: [
            {
              productId: prod.id,
              productName: prod.name,
              quantity: payload.quantity,
              unitCostCents: payload.unitCostCents,
            },
          ],
          totalCents,
          userName: currentUser.name,
          createdAt: new Date().toISOString(),
        },
        ...prev.purchases,
      ],
      auditLog: [
        createAuditEntry(
          "purchase_received",
          currentUser,
          `Entrada de ${payload.quantity} ${prod.unit} de "${prod.name}" (${sup.name}) por ${formatMXN(totalCents)} [${prev.settings.inventoryValuation}].`
        ),
        ...prev.auditLog,
      ],
    }));

    toast.success(`Compra sumada al inventario (+${payload.quantity} ${prod.unit}).`);
  };

  const handleUpdateSettings = (nextSettings: BusinessSettings) => {
    setState((prev) => ({
      ...prev,
      settings: nextSettings,
      auditLog: [
        createAuditEntry(
          "settings_updated",
          currentUser,
          `Configuración actualizada: Costeo ${nextSettings.inventoryValuation}, Arqueo ciego ${nextSettings.blindCashCount ? "Sí" : "No"}, Stock negativo ${nextSettings.allowNegativeStock ? "Permitido" : "Bloqueado"}.`
        ),
        ...prev.auditLog,
      ],
    }));
  };

  const handleSaveUser = (user: FerreUser, isNew: boolean) => {
    setState((prev) => ({
      ...prev,
      users: isNew
        ? [...prev.users, user]
        : prev.users.map((u) => (u.id === user.id ? user : u)),
      auditLog: [
        createAuditEntry(
          "user_updated",
          currentUser,
          `${isNew ? "Usuario creado" : "Usuario/permisos editados"}: ${user.name} (${ROLE_LABELS[user.role]}).`
        ),
        ...prev.auditLog,
      ],
    }));
  };

  const handleSaveCustomer = (customer: FerreCustomer, isNew: boolean) => {
    setState((prev) => ({
      ...prev,
      customers: isNew
        ? [...prev.customers, customer]
        : prev.customers.map((c) => (c.id === customer.id ? customer : c)),
      auditLog: [
        createAuditEntry(
          "customer_updated",
          currentUser,
          `${isNew ? "Alta" : "Edición"} de cliente "${customer.name}"${customer.creditEnabled ? ` (Límite: ${formatMXN(customer.creditLimitCents)})` : ""}.`
        ),
        ...prev.auditLog,
      ],
    }));
    toast.success(isNew ? "Cliente registrado." : "Cliente actualizado.");
  };

  const handleRecordCreditPayment = (
    customerId: string,
    amountCents: number,
    reference: string
  ) => {
    const cust = state.customers.find((c) => c.id === customerId);
    if (!cust) return;
    const nowIso = new Date().toISOString();

    setState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) =>
        c.id === customerId
          ? {
              ...c,
              creditBalanceCents: Math.max(
                0,
                subtractCents(c.creditBalanceCents, amountCents)
              ),
              ledger: [
                {
                  id: generateId(),
                  type: "payment" as const,
                  amountCents,
                  reference,
                  userName: currentUser.name,
                  createdAt: nowIso,
                },
                ...c.ledger,
              ],
            }
          : c
      ),
      shifts: openShift
        ? prev.shifts.map((s) =>
            s.id === openShift.id
              ? {
                  ...s,
                  movements: [
                    ...s.movements,
                    {
                      id: generateId(),
                      type: "deposit" as const,
                      amountCents,
                      reason: `Abono crédito: ${cust.name} (${reference})`,
                      userName: currentUser.name,
                      createdAt: nowIso,
                    },
                  ],
                }
              : s
          )
        : prev.shifts,
      auditLog: [
        createAuditEntry(
          "credit_payment",
          currentUser,
          `Abono de ${formatMXN(amountCents)} de "${cust.name}" (${reference}).`
        ),
        ...prev.auditLog,
      ],
    }));

    toast.success(
      openShift
        ? `Abono de ${formatMXN(amountCents)} registrado y sumado a caja.`
        : `Abono de ${formatMXN(amountCents)} registrado.`
    );
  };

  const handleToggleFreezeCustomer = (customerId: string) => {
    const cust = state.customers.find((c) => c.id === customerId);
    if (!cust) return;
    setState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) =>
        c.id === customerId ? { ...c, creditFrozen: !c.creditFrozen } : c
      ),
      auditLog: [
        createAuditEntry(
          "customer_updated",
          currentUser,
          `${cust.creditFrozen ? "Reactivó" : "Congeló"} crédito de "${cust.name}".`
        ),
        ...prev.auditLog,
      ],
    }));
    toast.info(
      cust.creditFrozen
        ? `Crédito de ${cust.name} reactivado.`
        : `Crédito de ${cust.name} congelado.`
    );
  };

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof ShoppingCart;
    visible: boolean;
  }> = [
    { id: "pos", label: "Mostrador", icon: ShoppingCart, visible: perms.canSell },
    {
      id: "cashier",
      label: "Caja",
      icon: Calculator,
      visible: perms.canOpenCloseShift || perms.canCollect,
    },
    {
      id: "customers",
      label: "Clientes y Crédito",
      icon: UserCheck,
      visible: perms.canSell || perms.canCollect || perms.canManageCredit,
    },
    {
      id: "inventory",
      label: "Inventario y Compras",
      icon: Package,
      visible: perms.canManageInventory || perms.canReceivePurchase,
    },
    {
      id: "reports",
      label: "Indicadores y Bitácora",
      icon: BarChart3,
      visible: perms.canViewReports || perms.canViewAudit,
    },
    {
      id: "settings",
      label: "Configuración",
      icon: Settings,
      visible: perms.canManageUsers || perms.canManageSettings,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Toaster position="top-right" richColors />

      {/* Barra superior */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block leading-none">
                {state.settings.businessName}
              </span>
              <span className="text-xs text-slate-300">
                {currentUser.name} • {ROLE_LABELS[currentUser.role]}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isOnline
                  ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800"
                  : "bg-amber-950/80 text-amber-300 border border-amber-700"
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5" strokeWidth={1.75} /> En línea
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" strokeWidth={1.75} /> Modo
                  local sin internet
                </>
              )}
            </span>

            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="min-h-10 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <LifeBuoy className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
              Ayuda
            </button>

            <button
              type="button"
              onClick={() => setCurrentUserId(null)}
              className="min-h-10 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
              Cambiar usuario
            </button>
          </div>
        </div>

        {/* Navegación principal */}
        <nav
          aria-label="Secciones principales"
          className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto border-t border-slate-800/80"
        >
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-12 px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
                    active
                      ? "border-amber-400 text-white bg-slate-800/60"
                      : "border-transparent text-slate-300 hover:text-white hover:bg-slate-800/40"
                  }`}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                  {item.label}
                </button>
              );
            })}
        </nav>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5">
        {currentUser.role === "driver" ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg mx-auto text-center shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900 mb-2">
              Módulo de Repartos en Versión 2
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Su puesto de <strong>Chofer</strong> ya está registrado y protegido
              en el sistema. Las rutas de reparto y mantenimiento de unidades se
              habilitarán en la siguiente etapa.
            </p>
          </div>
        ) : (
          <>
            {activeTab === "pos" && perms.canSell && (
              <PosView
                currentUser={currentUser}
                users={state.users}
                products={state.products}
                customers={state.customers}
                settings={state.settings}
                openShift={openShift}
                parkedOrders={state.parkedOrders}
                onCompleteSale={handleCompleteSale}
                onParkOrder={handleParkOrder}
                onResumeParkedOrder={handleResumeParkedOrder}
              />
            )}
            {activeTab === "cashier" &&
              (perms.canOpenCloseShift || perms.canCollect) && (
                <CashierView
                  currentUser={currentUser}
                  users={state.users}
                  settings={state.settings}
                  openShift={openShift}
                  shifts={state.shifts}
                  sales={state.sales}
                  onOpenShift={handleOpenShift}
                  onAddMovement={handleAddMovement}
                  onCloseShift={handleCloseShift}
                  onCancelSale={handleCancelSale}
                />
              )}
            {activeTab === "customers" &&
              (perms.canSell || perms.canCollect || perms.canManageCredit) && (
                <CustomersView
                  currentUser={currentUser}
                  customers={state.customers}
                  onSaveCustomer={handleSaveCustomer}
                  onRecordPayment={handleRecordCreditPayment}
                  onToggleFreeze={handleToggleFreezeCustomer}
                />
              )}
            {activeTab === "inventory" &&
              (perms.canManageInventory || perms.canReceivePurchase) && (
                <InventoryPurchasingView
                  currentUser={currentUser}
                  settings={state.settings}
                  products={state.products}
                  suppliers={state.suppliers}
                  purchases={state.purchases}
                  onAdjustStock={handleAdjustStock}
                  onSaveProduct={handleSaveProduct}
                  onAddSupplier={handleAddSupplier}
                  onReceivePurchase={handleReceivePurchase}
                />
              )}
            {activeTab === "reports" &&
              (perms.canViewReports || perms.canViewAudit) && (
                <ReportsAuditView
                  sales={state.sales}
                  shifts={state.shifts}
                  products={state.products}
                  auditLog={state.auditLog}
                />
              )}
            {activeTab === "settings" &&
              (perms.canManageUsers || perms.canManageSettings) && (
                <SettingsView
                  currentUser={currentUser}
                  state={state}
                  onUpdateSettings={handleUpdateSettings}
                  onSaveUser={handleSaveUser}
                  onImportBackup={(nextState) => setState(nextState)}
                />
              )}
          </>
        )}
      </main>

      {supportOpen && (
        <UsersSupportModal
          mode="support"
          users={state.users}
          canManageUsers={false}
          onClose={() => setSupportOpen(false)}
          onAddUser={() => {}}
          onToggleUser={() => {}}
        />
      )}
    </div>
  );
}

export default App;

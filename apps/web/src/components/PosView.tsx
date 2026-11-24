import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Clock,
  CreditCard,
  Minus,
  PauseCircle,
  Plus,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@modulos/core-shared";
import {
  addCents,
  formatMXN,
  multiplyCents,
  pesosToCents,
  searchProductsFast,
  subtractCents,
} from "../core/ferre-store.js";
import type {
  BusinessSettings,
  CartItem,
  CashShift,
  FerreProduct,
  FerreUser,
  ParkedOrder,
  PaymentMethod,
} from "../core/ferre-types.js";

interface PosViewProps {
  currentUser: FerreUser;
  users: FerreUser[];
  products: FerreProduct[];
  settings: BusinessSettings;
  openShift: CashShift | undefined;
  parkedOrders: ParkedOrder[];
  onCompleteSale: (payload: {
    items: CartItem[];
    discountCents: number;
    paymentMethod: PaymentMethod;
    cashReceivedCents: number;
    authorizedBy?: FerreUser;
  }) => void;
  onParkOrder: (label: string, items: CartItem[]) => void;
  onResumeParkedOrder: (orderId: string) => ParkedOrder | undefined;
}

export function PosView({
  currentUser,
  users,
  products,
  settings,
  openShift,
  parkedOrders,
  onCompleteSale,
  onParkOrder,
  onResumeParkedOrder,
}: PosViewProps) {
  const perms = currentUser.permissions;
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPesos, setDiscountPesos] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceivedPesos, setCashReceivedPesos] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");
  const [parkLabel, setParkLabel] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = useMemo(
    () => searchProductsFast(products, query),
    [products, query]
  );

  const subtotalCents = useMemo(
    () => cart.reduce((acc, item) => addCents(acc, item.subtotalCents), 0),
    [cart]
  );

  const discountCents = useMemo(() => {
    const val = Number(discountPesos);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return Math.min(pesosToCents(val), subtotalCents);
  }, [discountPesos, subtotalCents]);

  const totalCents = subtractCents(subtotalCents, discountCents);

  const cashReceivedCents = useMemo(() => {
    const val = Number(cashReceivedPesos);
    return Number.isFinite(val) && val > 0 ? pesosToCents(val) : 0;
  }, [cashReceivedPesos]);

  const changeCents =
    paymentMethod === "cash" ? Math.max(0, cashReceivedCents - totalCents) : 0;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "F9" && cart.length > 0 && perms.canCollect) {
        e.preventDefault();
        setShowCheckout(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cart.length, perms.canCollect]);

  const addToCart = (product: FerreProduct, qty = 1) => {
    if (!settings.allowNegativeStock && product.stock <= 0) {
      toast.error(`Sin existencias de "${product.name}".`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        const nextQty = Number((existing.quantity + qty).toFixed(3));
        if (!settings.allowNegativeStock && nextQty > product.stock) {
          toast.error(
            `Solo hay ${product.stock} ${product.unit} disponibles de "${product.name}".`
          );
          return prev;
        }
        return prev.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: nextQty,
                subtotalCents: multiplyCents(i.unitPriceCents, nextQty),
              }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          quantity: qty,
          unitPriceCents: product.priceCents,
          unitCostCents: product.costCents,
          subtotalCents: multiplyCents(product.priceCents, qty),
        },
      ];
    });
  };

  const updateItemQty = (productId: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    const prod = products.find((p) => p.id === productId);
    if (prod && nextQty > prod.stock) {
      toast.error(`Máximo disponible: ${prod.stock} ${prod.unit}.`);
      return;
    }
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? {
              ...i,
              quantity: nextQty,
              subtotalCents: multiplyCents(i.unitPriceCents, nextQty),
            }
          : i
      )
    );
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim().length > 0) {
      e.preventDefault();
      if (filteredProducts.length === 1 && filteredProducts[0]) {
        addToCart(filteredProducts[0], 1);
        setQuery("");
      }
    }
  };

  const handleParkCurrent = () => {
    if (cart.length === 0) return;
    const label =
      parkLabel.trim() || `Cliente ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
    onParkOrder(label, cart);
    setCart([]);
    setDiscountPesos("");
    setParkLabel("");
    toast.success(`Pedido "${label}" enviado a espera para cobro en caja.`);
  };

  const handleResume = (orderId: string) => {
    const order = onResumeParkedOrder(orderId);
    if (!order) return;
    setCart(order.items);
    toast.info(`Pedido "${order.label}" cargado en el mostrador.`);
  };

  const handleConfirmSale = () => {
    if (!openShift) {
      toast.error("Abra la caja antes de cobrar una venta.");
      return;
    }
    if (paymentMethod === "cash" && cashReceivedCents < totalCents) {
      toast.error("El efectivo recibido es menor al total a cobrar.");
      return;
    }

    let authorizedBy: FerreUser | undefined;
    if (discountCents > 0 && !perms.canApplyDiscount) {
      const sup = users.find(
        (u) =>
          u.active &&
          u.id !== currentUser.id &&
          (u.role === "owner" || u.role === "manager") &&
          u.pin === supervisorPin.trim()
      );
      if (!sup) {
        toast.error(
          "Para aplicar descuento ingrese el PIN de Dueño o Encargado."
        );
        return;
      }
      authorizedBy = sup;
    }

    onCompleteSale({
      items: cart,
      discountCents,
      paymentMethod,
      cashReceivedCents:
        paymentMethod === "cash" ? cashReceivedCents : totalCents,
      authorizedBy,
    });
    setCart([]);
    setDiscountPesos("");
    setCashReceivedPesos("");
    setSupervisorPin("");
    setShowCheckout(false);
    searchInputRef.current?.focus();
  };

  const quickBills = [50, 100, 200, 500, 1000];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Catálogo y búsqueda rápida */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <label
            htmlFor="pos-search"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"
          >
            Buscar producto por código de barras, clave o nombre (F2)
          </label>
          <div className="relative">
            <Search
              className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              strokeWidth={1.75}
            />
            <input
              ref={searchInputRef}
              id="pos-search"
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Ej. MAR-16, 750100100001 o martillo..."
              className="w-full h-12 pl-11 pr-4 rounded-lg border border-slate-300 bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Pedidos en espera (Vendedor -> Cajera) */}
        {parkedOrders.length > 0 && (
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm mb-2.5">
              <Clock className="w-4 h-4" strokeWidth={1.75} />
              <span>Pedidos en espera de cobro ({parkedOrders.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parkedOrders.map((po) => (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => handleResume(po.id)}
                  className="min-h-11 px-3.5 py-2 rounded-lg bg-white border border-amber-300 hover:border-amber-500 text-left text-sm shadow-xs active:scale-[0.98] transition"
                >
                  <span className="font-semibold text-slate-900 block">
                    {po.label}
                  </span>
                  <span className="text-xs text-slate-600 tabular-nums">
                    {formatMXN(po.totalCents)} • {po.createdBy}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista densa de productos para selección veloz */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <h2 className="text-sm font-semibold text-slate-700">
              Catálogo rápido ({filteredProducts.length})
            </h2>
            <span className="text-xs text-slate-500">
              Toque un producto para agregarlo
            </span>
          </div>
          {filteredProducts.length === 0 ? (
            <div className="p-8 text-center text-slate-600 text-sm">
              No se encontraron productos con "{query}".
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto">
              {filteredProducts.map((p) => {
                const lowStock = p.stock <= p.minStock;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p, 1)}
                    disabled={!settings.allowNegativeStock && p.stock <= 0}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 disabled:opacity-50 active:bg-slate-100 transition"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900 truncate">
                        {p.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-0.5">
                        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          {p.sku}
                        </span>
                        <span>{p.category}</span>
                        <span
                          className={`font-semibold ${
                            lowStock ? "text-amber-700" : "text-slate-600"
                          }`}
                        >
                          Stock: {p.stock} {p.unit}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {formatMXN(p.priceCents)}
                      </p>
                      <span className="text-xs text-slate-500">
                        por {p.unit}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Carrito y cobro */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden sticky top-4">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-amber-400" strokeWidth={1.75} />
            <h2 className="text-base font-semibold">Nota de Mostrador</h2>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCart([]);
                setDiscountPesos("");
              }}
              className="text-xs text-slate-300 hover:text-white underline"
            >
              Vaciar
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Escanee un código de barras o toque un producto para iniciar la
              venta.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[320px] overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.productId} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-600 tabular-nums">
                      {formatMXN(item.unitPriceCents)} / {item.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Restar ${item.name}`}
                      onClick={() =>
                        updateItemQty(
                          item.productId,
                          Number((item.quantity - 1).toFixed(3))
                        )
                      }
                      className="min-w-10 min-h-10 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      aria-label={`Cantidad de ${item.name}`}
                      value={item.quantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (Number.isFinite(val)) updateItemQty(item.productId, val);
                      }}
                      className="w-16 h-10 text-center border border-slate-300 rounded-lg text-sm font-semibold tabular-nums"
                    />
                    <button
                      type="button"
                      aria-label={`Sumar ${item.name}`}
                      onClick={() =>
                        updateItemQty(
                          item.productId,
                          Number((item.quantity + 1).toFixed(3))
                        )
                      }
                      className="min-w-10 min-h-10 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                  <div className="w-24 text-right">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      {formatMXN(item.subtotalCents)}
                    </p>
                    <button
                      type="button"
                      aria-label={`Quitar ${item.name}`}
                      onClick={() => updateItemQty(item.productId, 0)}
                      className="text-xs text-red-600 hover:underline inline-flex items-center gap-0.5 mt-0.5"
                    >
                      <Trash2 className="w-3 h-3" strokeWidth={1.75} /> Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Descuento opcional */}
          {cart.length > 0 && (
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
              <label
                htmlFor="discount-pesos"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"
              >
                <Tag className="w-4 h-4 text-slate-500" strokeWidth={1.75} />
                Descuento ($)
              </label>
              <input
                id="discount-pesos"
                type="number"
                min="0"
                step="0.50"
                value={discountPesos}
                onChange={(e) => setDiscountPesos(e.target.value)}
                placeholder="0.00"
                className="w-32 h-10 px-3 rounded-lg border border-slate-300 text-right text-sm font-semibold tabular-nums"
              />
            </div>
          )}

          {/* Totales */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMXN(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-sm text-amber-700 font-medium">
                <span>Descuento</span>
                <span className="tabular-nums">-{formatMXN(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1 border-t border-slate-200">
              <span className="text-base font-semibold text-slate-900">
                Total a cobrar
              </span>
              <span className="text-2xl font-bold text-slate-900 tabular-nums">
                {formatMXN(totalCents)}
              </span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="space-y-2.5">
            {perms.canCollect ? (
              <button
                type="button"
                disabled={cart.length === 0 || !openShift}
                onClick={() => {
                  setCashReceivedPesos(String((totalCents / 100).toFixed(2)));
                  setShowCheckout(true);
                }}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold text-base px-4 py-3 active:scale-[0.98] transition"
              >
                <Banknote className="w-5 h-5" strokeWidth={1.75} />
                {openShift ? "Cobrar ahora (F9)" : "Abra la caja para cobrar"}
              </button>
            ) : (
              <p className="text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                Su puesto ({currentUser.name}) arma pedidos y los envía a caja
                para cobro.
              </p>
            )}

            {cart.length > 0 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={parkLabel}
                  onChange={(e) => setParkLabel(e.target.value)}
                  placeholder="Nombre o referencia (opcional)"
                  className="flex-1 h-11 px-3 rounded-lg border border-slate-300 text-sm"
                />
                <button
                  type="button"
                  onClick={handleParkCurrent}
                  className="min-h-11 px-3.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-800 font-medium text-sm inline-flex items-center gap-1.5 shrink-0 active:scale-[0.98] transition"
                >
                  <PauseCircle className="w-4 h-4" strokeWidth={1.75} />
                  Dejar en espera
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de cobro rápido */}
      {showCheckout && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cobrar venta"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Cobrar venta
              </h3>
              <button
                type="button"
                aria-label="Cerrar cobro"
                onClick={() => setShowCheckout(false)}
                className="min-w-10 min-h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total a pagar
                </p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
                  {formatMXN(totalCents)}
                </p>
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 mb-2">
                  Forma de pago
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["cash", "Efectivo", Banknote],
                      ["card", "Tarjeta", CreditCard],
                      ["transfer", "Transfer.", CreditCard],
                    ] as const
                  ).map(([method, label, Icon]) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`min-h-11 rounded-lg border text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
                        paymentMethod === method
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.75} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === "cash" && (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="cash-received"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Efectivo recibido ($)
                    </label>
                    <input
                      id="cash-received"
                      type="number"
                      step="0.50"
                      autoFocus
                      value={cashReceivedPesos}
                      onChange={(e) => setCashReceivedPesos(e.target.value)}
                      className="w-full h-12 px-4 rounded-lg border border-slate-300 text-xl font-bold text-right tabular-nums"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickBills.map((bill) => (
                      <button
                        key={bill}
                        type="button"
                        onClick={() => setCashReceivedPesos(String(bill))}
                        className="min-h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 tabular-nums"
                      >
                        ${bill}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                    <span className="text-sm font-semibold text-emerald-900">
                      Cambio a entregar:
                    </span>
                    <span className="text-xl font-bold text-emerald-800 tabular-nums">
                      {formatMXN(changeCents)}
                    </span>
                  </div>
                </div>
              )}

              {discountCents > 0 && !perms.canApplyDiscount && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 space-y-2">
                  <label
                    htmlFor="sup-pin-discount"
                    className="block text-xs font-semibold text-amber-900"
                  >
                    Descuento requiere PIN de Dueño o Encargado
                  </label>
                  <input
                    id="sup-pin-discount"
                    type="password"
                    inputMode="numeric"
                    value={supervisorPin}
                    onChange={(e) =>
                      setSupervisorPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="PIN de autorización"
                    className="w-full h-11 px-3 rounded-lg border border-amber-300 bg-white text-sm"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmSale}
                className="w-full min-h-12 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base px-4 py-3 active:scale-[0.98] transition"
              >
                Confirmar cobro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function buildParkedOrder(
  label: string,
  items: CartItem[],
  userName: string
): ParkedOrder {
  const totalCents = items.reduce((acc, i) => addCents(acc, i.subtotalCents), 0);
  return {
    id: generateId(),
    label,
    createdBy: userName,
    createdAt: new Date().toISOString(),
    items,
    totalCents,
  };
}

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  PackagePlus,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  ROLE_PERMISSIONS,
  formatMXN,
  pesosToCents,
} from "../core/ferre-store.js";
import type {
  FerreProduct,
  FerreSupplier,
  FerreUser,
  PurchaseRecord,
} from "../core/ferre-types.js";

interface InventoryPurchasingViewProps {
  currentUser: FerreUser;
  products: FerreProduct[];
  suppliers: FerreSupplier[];
  purchases: PurchaseRecord[];
  onAdjustStock: (productId: string, delta: number, reason: string) => void;
  onReceivePurchase: (payload: {
    supplierId: string;
    productId: string;
    quantity: number;
    unitCostCents: number;
  }) => void;
}

export function InventoryPurchasingView({
  currentUser,
  products,
  suppliers,
  purchases,
  onAdjustStock,
  onReceivePurchase,
}: InventoryPurchasingViewProps) {
  const perms = ROLE_PERMISSIONS[currentUser.role];
  const [tab, setTab] = useState<"stock" | "purchases">("stock");

  const [adjProductId, setAdjProductId] = useState(products[0]?.id ?? "");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [purProductId, setPurProductId] = useState(products[0]?.id ?? "");
  const [purQty, setPurQty] = useState("10");
  const [purCostPesos, setPurCostPesos] = useState("");

  const lowStockProducts = products.filter(
    (p) => p.active && p.stock <= p.minStock
  );

  const handleAdjust = (e: FormEvent) => {
    e.preventDefault();
    if (!perms.canManageInventory) {
      toast.error("No tiene permiso para ajustar inventario.");
      return;
    }
    const delta = Number(adjDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Ingrese una cantidad distinta de cero (+ o -).");
      return;
    }
    if (adjReason.trim().length < 5) {
      toast.error("Explique el motivo del ajuste (mínimo 5 letras).");
      return;
    }
    onAdjustStock(adjProductId, delta, adjReason.trim());
    setAdjDelta("");
    setAdjReason("");
  };

  const handlePurchase = (e: FormEvent) => {
    e.preventDefault();
    if (!perms.canReceivePurchase) {
      toast.error("No tiene permiso para registrar compras a proveedores.");
      return;
    }
    const qty = Number(purQty);
    const selectedProd = products.find((p) => p.id === purProductId);
    const costCents =
      purCostPesos.trim() !== ""
        ? pesosToCents(Number(purCostPesos))
        : selectedProd?.costCents ?? 0;

    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("La cantidad comprada debe ser mayor a cero.");
      return;
    }
    if (costCents < 0) {
      toast.error("Costo unitario inválido.");
      return;
    }
    onReceivePurchase({
      supplierId,
      productId: purProductId,
      quantity: qty,
      unitCostCents: costCents,
    });
    setPurCostPesos("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab("stock")}
            className={`min-h-10 px-4 rounded-md text-sm font-semibold transition ${
              tab === "stock"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Existencias y Ajustes
          </button>
          <button
            type="button"
            onClick={() => setTab("purchases")}
            className={`min-h-10 px-4 rounded-md text-sm font-semibold transition ${
              tab === "purchases"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Compras a Proveedores
          </button>
        </div>

        {lowStockProducts.length > 0 && (
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-3.5 py-2 rounded-lg text-sm font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
            <span>
              {lowStockProducts.length} productos con existencia baja
            </span>
          </div>
        )}
      </div>

      {tab === "stock" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h2 className="text-sm font-semibold text-slate-800">
                Inventario Actual ({products.length} artículos)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3 text-right">Precio Venta</th>
                    <th className="px-4 py-3 text-right">Existencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((p) => {
                    const isLow = p.stock <= p.minStock;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {p.sku} • {p.barcode}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.category}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {formatMXN(p.priceCents)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isLow
                                ? "bg-amber-100 text-amber-900"
                                : "bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {p.stock} {p.unit}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <SlidersHorizontal
                className="w-5 h-5 text-slate-700"
                strokeWidth={1.75}
              />
              <h3 className="text-base font-semibold text-slate-900">
                Ajuste Manual Auditado
              </h3>
            </div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Use positivo (+) si encontró sobrante o negativo (-) por merma o
              daño. Todo ajuste queda registrado con su nombre.
            </p>
            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <label
                  htmlFor="adj-product"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Producto
                </label>
                <select
                  id="adj-product"
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {p.stock})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="adj-delta"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Cantidad a sumar o restar
                </label>
                <input
                  id="adj-delta"
                  type="number"
                  step="any"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                  placeholder="Ej. -2 o +5"
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="adj-reason"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Motivo obligatorio
                </label>
                <input
                  id="adj-reason"
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Ej. Bulto roto en bodega"
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={!perms.canManageInventory}
                className="w-full min-h-11 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold px-4 py-2 active:scale-[0.98] transition"
              >
                Aplicar ajuste
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <PackagePlus className="w-5 h-5 text-slate-800" strokeWidth={1.75} />
              <h2 className="text-base font-semibold text-slate-900">
                Recibir Compra de Proveedor
              </h2>
            </div>
            <form onSubmit={handlePurchase} className="space-y-3">
              <div>
                <label
                  htmlFor="pur-supplier"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Proveedor
                </label>
                <select
                  id="pur-supplier"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="pur-product"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Producto recibido
                </label>
                <select
                  id="pur-product"
                  value={purProductId}
                  onChange={(e) => setPurProductId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Costo actual: {formatMXN(p.costCents)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="pur-qty"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Cantidad
                  </label>
                  <input
                    id="pur-qty"
                    type="number"
                    min="0.1"
                    step="any"
                    value={purQty}
                    onChange={(e) => setPurQty(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="pur-cost"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Nuevo costo ($)
                  </label>
                  <input
                    id="pur-cost"
                    type="number"
                    min="0"
                    step="0.50"
                    value={purCostPesos}
                    onChange={(e) => setPurCostPesos(e.target.value)}
                    placeholder="Opcional"
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!perms.canReceivePurchase}
                className="w-full min-h-11 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold px-4 py-2 active:scale-[0.98] transition"
              >
                Sumar al inventario
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-5 h-5 text-slate-700" strokeWidth={1.75} />
              <h3 className="text-base font-semibold text-slate-900">
                Compras Recientes ({purchases.length})
              </h3>
            </div>
            {purchases.length === 0 ? (
              <p className="text-sm text-slate-500 py-6">
                Aún no se han registrado entradas de proveedores.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {purchases.map((pur) => (
                  <div
                    key={pur.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {pur.supplierName}
                      </p>
                      <p className="text-xs text-slate-600">
                        {pur.items
                          .map((i) => `${i.quantity} × ${i.productName}`)
                          .join(", ")}{" "}
                        • Recibió: {pur.userName}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatMXN(pur.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

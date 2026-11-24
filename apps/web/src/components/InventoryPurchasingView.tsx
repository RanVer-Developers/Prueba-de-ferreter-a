import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Edit3,
  PackagePlus,
  Plus,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@modulos/core-shared";
import { formatMXN, pesosToCents } from "../core/ferre-store.js";
import type {
  BusinessSettings,
  FerreProduct,
  FerreSupplier,
  FerreUser,
  PurchaseRecord,
} from "../core/ferre-types.js";

interface InventoryPurchasingViewProps {
  currentUser: FerreUser;
  settings: BusinessSettings;
  products: FerreProduct[];
  suppliers: FerreSupplier[];
  purchases: PurchaseRecord[];
  onAdjustStock: (productId: string, delta: number, reason: string) => void;
  onSaveProduct: (product: FerreProduct, isNew: boolean) => void;
  onAddSupplier: (supplier: FerreSupplier) => void;
  onReceivePurchase: (payload: {
    supplierId: string;
    productId: string;
    quantity: number;
    unitCostCents: number;
  }) => void;
}

export function InventoryPurchasingView({
  currentUser,
  settings,
  products,
  suppliers,
  purchases,
  onAdjustStock,
  onSaveProduct,
  onAddSupplier,
  onReceivePurchase,
}: InventoryPurchasingViewProps) {
  const perms = currentUser.permissions;
  const [tab, setTab] = useState<"stock" | "purchases">("stock");

  // Ajuste de stock
  const [adjProductId, setAdjProductId] = useState(products[0]?.id ?? "");
  const [adjDelta, setAdjDelta] = useState("");
  const [adjReason, setAdjReason] = useState("");

  // Modal de producto
  const [editingProduct, setEditingProduct] = useState<FerreProduct | null>(
    null
  );
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [pSku, setPSku] = useState("");
  const [pBarcode, setPBarcode] = useState("");
  const [pName, setPName] = useState("");
  const [pCategory, setPCategory] = useState("Herramientas");
  const [pUnit, setPUnit] = useState("pieza");
  const [pCostPesos, setPCostPesos] = useState("");
  const [pPricePesos, setPPricePesos] = useState("");
  const [pStock, setPStock] = useState("0");
  const [pMinStock, setPMinStock] = useState("5");

  // Compras y nuevo proveedor
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [purProductId, setPurProductId] = useState(products[0]?.id ?? "");
  const [purQty, setPurQty] = useState("10");
  const [purCostPesos, setPurCostPesos] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");

  const lowStockProducts = products.filter(
    (p) => p.active && p.stock <= p.minStock
  );

  const openProductModal = (prod?: FerreProduct) => {
    if (prod) {
      setIsNewProduct(false);
      setEditingProduct(prod);
      setPSku(prod.sku);
      setPBarcode(prod.barcode);
      setPName(prod.name);
      setPCategory(prod.category);
      setPUnit(prod.unit);
      setPCostPesos((prod.costCents / 100).toFixed(2));
      setPPricePesos((prod.priceCents / 100).toFixed(2));
      setPStock(String(prod.stock));
      setPMinStock(String(prod.minStock));
    } else {
      setIsNewProduct(true);
      setEditingProduct({
        id: generateId(),
        sku: "",
        barcode: "",
        name: "",
        category: "Herramientas",
        unit: "pieza",
        costCents: 0,
        priceCents: 0,
        stock: 0,
        minStock: 5,
        active: true,
      });
      setPSku("");
      setPBarcode("");
      setPName("");
      setPCategory("Herramientas");
      setPUnit("pieza");
      setPCostPesos("");
      setPPricePesos("");
      setPStock("0");
      setPMinStock("5");
    }
  };

  const handleSaveProduct = (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (pSku.trim().length < 2 || pName.trim().length < 2) {
      toast.error("La clave (SKU) y el nombre son obligatorios.");
      return;
    }
    const costCents = pesosToCents(Number(pCostPesos) || 0);
    const priceCents = pesosToCents(Number(pPricePesos) || 0);
    const stock = Number(pStock);
    const minStock = Number(pMinStock);

    if (costCents < 0 || priceCents <= 0 || stock < 0 || minStock < 0) {
      toast.error("Revise que precios y existencias sean válidos.");
      return;
    }

    onSaveProduct(
      {
        ...editingProduct,
        sku: pSku.trim().toUpperCase(),
        barcode: pBarcode.trim(),
        name: pName.trim(),
        category: pCategory.trim() || "General",
        unit: pUnit.trim() || "pieza",
        costCents,
        priceCents,
        stock,
        minStock,
      },
      isNewProduct
    );
    setEditingProduct(null);
  };

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

  const handleCreateSupplier = (e: FormEvent) => {
    e.preventDefault();
    if (supName.trim().length < 2) {
      toast.error("Escriba el nombre del proveedor.");
      return;
    }
    const newSup: FerreSupplier = {
      id: generateId(),
      name: supName.trim(),
      phone: supPhone.trim(),
    };
    onAddSupplier(newSup);
    setSupplierId(newSup.id);
    setSupName("");
    setSupPhone("");
    setShowNewSupplier(false);
    toast.success("Proveedor agregado.");
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
            Existencias y Productos
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg">
            Costeo:{" "}
            {settings.inventoryValuation === "FIFO"
              ? "PEPS / FIFO"
              : "Costo Promedio (CMP)"}
          </span>

          {lowStockProducts.length > 0 && (
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <AlertTriangle
                className="w-4 h-4 text-amber-600"
                strokeWidth={1.75}
              />
              <span>{lowStockProducts.length} con stock bajo</span>
            </div>
          )}

          {perms.canManageInventory && (
            <button
              type="button"
              onClick={() => openProductModal()}
              className="min-h-10 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              Nuevo producto
            </button>
          )}
        </div>
      </div>

      {tab === "stock" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h2 className="text-sm font-semibold text-slate-800">
                Catálogo e Inventario ({products.length} artículos)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3 text-right">Costo</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                    <th className="px-4 py-3 text-right">Existencia</th>
                    {perms.canManageInventory && (
                      <th className="px-4 py-3 text-right">Acción</th>
                    )}
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
                            {p.sku} • {p.category}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                          {formatMXN(p.costCents)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
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
                        {perms.canManageInventory && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openProductModal(p)}
                              className="min-h-8 px-2.5 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                              Editar
                            </button>
                          </td>
                        )}
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
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackagePlus
                  className="w-5 h-5 text-slate-800"
                  strokeWidth={1.75}
                />
                <h2 className="text-base font-semibold text-slate-900">
                  Recibir Compra de Proveedor
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSupplier((v) => !v)}
                className="text-xs font-semibold text-slate-700 hover:underline"
              >
                + Nuevo proveedor
              </button>
            </div>

            {showNewSupplier && (
              <form
                onSubmit={handleCreateSupplier}
                className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2"
              >
                <input
                  type="text"
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="w-full h-10 px-3 rounded border border-slate-300 text-sm"
                />
                <input
                  type="text"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  className="w-full h-10 px-3 rounded border border-slate-300 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-9 px-3 rounded bg-slate-900 text-white text-xs font-semibold"
                >
                  Guardar proveedor
                </button>
              </form>
            )}

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

      {/* Modal de Alta / Edición de Producto */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={isNewProduct ? "Nuevo producto" : "Editar producto"}
        >
          <form
            onSubmit={handleSaveProduct}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {isNewProduct ? "Nuevo producto" : "Editar producto"}
              </h3>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setEditingProduct(null)}
                className="min-w-10 min-h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Clave (SKU) *
                  </label>
                  <input
                    type="text"
                    value={pSku}
                    onChange={(e) => setPSku(e.target.value)}
                    placeholder="Ej. TAL-12"
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Código de barras
                  </label>
                  <input
                    type="text"
                    value={pBarcode}
                    onChange={(e) => setPBarcode(e.target.value)}
                    placeholder="750100..."
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre del producto *
                </label>
                <input
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  placeholder="Ej. Taladro rotomartillo 1/2"
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unidad de venta
                  </label>
                  <select
                    value={pUnit}
                    onChange={(e) => setPUnit(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                  >
                    <option value="pieza">Pieza</option>
                    <option value="metro">Metro</option>
                    <option value="kilo">Kilo</option>
                    <option value="litro">Litro</option>
                    <option value="bulto">Bulto</option>
                    <option value="cubeta">Cubeta</option>
                    <option value="caja">Caja</option>
                    <option value="juego">Juego</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Costo ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={pCostPesos}
                    onChange={(e) => setPCostPesos(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Precio ($) *
                  </label>
                  <input
                    type="number"
                    min="0.50"
                    step="0.50"
                    value={pPricePesos}
                    onChange={(e) => setPPricePesos(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Existencia
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={pStock}
                    onChange={(e) => setPStock(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mínimo
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={pMinStock}
                    onChange={(e) => setPMinStock(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="min-h-11 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                >
                  Guardar producto
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

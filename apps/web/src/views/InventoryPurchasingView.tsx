import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, PackagePlus, ShoppingBag } from 'lucide-react';
import type { CostIncreaseAlert, FerreteriaApp, ProductSearchResult, SaleUnitKind } from '@ferreteria/core';
import { formatMoneyCents, humanizeError } from '../utils/format';

interface InventoryPurchasingViewProps {
  app: FerreteriaApp;
  revision: number;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function InventoryPurchasingView({
  app,
  revision,
  onDataChanged,
  onNotify,
}: InventoryPurchasingViewProps) {
  const [lowStock, setLowStock] = useState<ProductSearchResult[]>([]);
  const [allProducts, setAllProducts] = useState<ProductSearchResult[]>([]);
  const [costAlerts, setCostAlerts] = useState<CostIncreaseAlert[]>([]);

  // Purchase receipt form
  const [supplierName, setSupplierName] = useState('Distribuidora Ferretera Central');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseItemId, setPurchaseItemId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('10');
  const [purchaseCostPesos, setPurchaseCostPesos] = useState('');

  // New product quick form
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newAliases, setNewAliases] = useState('');
  const [newAisle, setNewAisle] = useState('P1');
  const [newShelf, setNewShelf] = useState('E1');
  const [newUnit, setNewUnit] = useState<SaleUnitKind>('PIECE');
  const [newPublicPesos, setNewPublicPesos] = useState('');
  const [newWholesalePesos, setNewWholesalePesos] = useState('');
  const [newCostPesos, setNewCostPesos] = useState('');
  const [newInitialStock, setNewInitialStock] = useState('10');

  useEffect(() => {
    let active = true;
    async function load() {
      const [reorder, all] = await Promise.all([
        app.getProductsToReorder(),
        app.searchProducts(''),
      ]);
      if (active) {
        setLowStock(reorder);
        setAllProducts(all);
        if (!purchaseItemId && all.length > 0) {
          setPurchaseItemId(all[0].itemId);
        }
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [app, revision, purchaseItemId]);

  const handleReceivePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseItemId || !invoiceNumber.trim() || Number(purchaseQty) <= 0 || Number(purchaseCostPesos) <= 0) {
      onNotify('error', 'Complete proveedor, folio/factura, producto, cantidad y costo unitario.');
      return;
    }
    try {
      const res = await app.receiveSupplierPurchase({
        supplierName: supplierName.trim(),
        invoiceNumber: invoiceNumber.trim(),
        lines: [
          {
            itemId: purchaseItemId,
            quantity: Number(purchaseQty),
            unitCostCents: Math.round(Number(purchaseCostPesos) * 100),
          },
        ],
      });
      setCostAlerts(res.costIncreaseAlerts);
      setInvoiceNumber('');
      setPurchaseCostPesos('');
      onDataChanged();
      onNotify('success', 'Entrada de mercancía registrada y existencias actualizadas.');
    } catch (err) {
      app.logError({ screen: 'Compras', action: 'Entrada de proveedor', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleRegisterProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim() || !newName.trim() || Number(newPublicPesos) <= 0) {
      onNotify('error', 'Complete código, nombre oficial y precio público.');
      return;
    }
    try {
      await app.registerProduct({
        itemId: `item-${newSku.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        sku: newSku.trim().toUpperCase(),
        officialName: newName.trim(),
        aliases: newAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        measures: [],
        category: 'General',
        aisle: newAisle,
        shelf: newShelf,
        baseUnit: newUnit,
        publicPriceCents: Math.round(Number(newPublicPesos) * 100),
        wholesalePriceCents: Math.round(
          Number(newWholesalePesos || newPublicPesos) * 100
        ),
        wholesaleMinQty: 10,
        lastCostCents: Math.round(Number(newCostPesos || 0) * 100),
        minStockQty: 5,
        initialStockQty: Number(newInitialStock || 0),
      });
      setNewSku('');
      setNewName('');
      setNewAliases('');
      setNewPublicPesos('');
      setNewWholesalePesos('');
      setNewCostPesos('');
      onDataChanged();
      onNotify('success', 'Producto registrado correctamente en el catálogo.');
    } catch (err) {
      app.logError({ screen: 'Inventario', action: 'Alta de producto', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Inventario, Reposición y Compras
        </h2>
        <p className="text-sm text-slate-600">
          Revise qué productos están por agotarse, registre entradas de proveedores y dé de alta
          artículos nuevos.
        </p>
      </div>

      {/* Alertas de subida de costo */}
      {costAlerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-900 font-semibold">
            <ArrowUpRight className="w-5 h-5" strokeWidth={1.75} />
            Aviso: El proveedor subió el costo en esta compra
          </div>
          {costAlerts.map((alert) => (
            <p key={alert.itemId} className="text-sm text-amber-900 tabular-nums">
              <strong>{alert.officialName}:</strong> subió de{' '}
              {formatMoneyCents(alert.previousCostCents)} a{' '}
              {formatMoneyCents(alert.newCostCents)}. Precio público sugerido para mantener
              margen: <strong>{formatMoneyCents(alert.suggestedPublicPriceCents)}</strong>.
            </p>
          ))}
        </div>
      )}

      {/* Productos por pedir */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
          Productos por Pedir ({lowStock.length})
        </h3>
        {lowStock.length === 0 ? (
          <p className="text-sm text-emerald-700 font-medium">
            Todo el inventario se encuentra por encima del mínimo configurado.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.map((item) => (
              <div
                key={item.itemId}
                className="border border-amber-200 bg-amber-50/50 rounded-lg p-3.5 space-y-1"
              >
                <p className="font-semibold text-slate-900 text-sm">{item.officialName}</p>
                <p className="text-xs text-slate-600 tabular-nums">
                  Actual:{' '}
                  <strong className={item.availableQty <= 0 ? 'text-red-600' : 'text-amber-700'}>
                    {item.availableQty}
                  </strong>{' '}
                  · Mínimo: {item.minStockQty} · {item.aisle}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Entrada de compra */}
        <form
          onSubmit={handleReceivePurchase}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
        >
          <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
            Registrar Entrada de Mercancía (Proveedor)
          </h3>

          <div className="space-y-3">
            <div>
              <label htmlFor="sup-name" className="block text-xs font-medium text-slate-600 mb-1">
                Proveedor
              </label>
              <input
                id="sup-name"
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="sup-inv" className="block text-xs font-medium text-slate-600 mb-1">
                Folio o factura de compra
              </label>
              <input
                id="sup-inv"
                type="text"
                placeholder="Ej. FAC-4501"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="sup-item" className="block text-xs font-medium text-slate-600 mb-1">
                Producto recibido
              </label>
              <select
                id="sup-item"
                value={purchaseItemId}
                onChange={(e) => setPurchaseItemId(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm bg-white"
              >
                {allProducts.map((p) => (
                  <option key={p.itemId} value={p.itemId}>
                    {p.officialName} (Costo actual: {formatMoneyCents(p.lastCostCents)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sup-qty" className="block text-xs font-medium text-slate-600 mb-1">
                  Cantidad recibida
                </label>
                <input
                  id="sup-qty"
                  type="number"
                  min="1"
                  step="0.5"
                  value={purchaseQty}
                  onChange={(e) => setPurchaseQty(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
                  required
                />
              </div>
              <div>
                <label htmlFor="sup-cost" className="block text-xs font-medium text-slate-600 mb-1">
                  Nuevo costo unitario ($)
                </label>
                <input
                  id="sup-cost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Ej. 210.00"
                  value={purchaseCostPesos}
                  onChange={(e) => setPurchaseCostPesos(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-[#1E3A5F] text-white font-semibold hover:bg-[#162D4A]"
          >
            Dar Entrada y Actualizar Costos
          </button>
        </form>

        {/* Alta rápida de producto */}
        <form
          onSubmit={handleRegisterProduct}
          className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
        >
          <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
            Alta Rápida de Producto
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Código / SKU (ej. HER-MAR-16)"
              value={newSku}
              onChange={(e) => setNewSku(e.target.value)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
              required
            />
            <input
              type="text"
              placeholder="Nombre oficial"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
              required
            />
            <input
              type="text"
              placeholder="Apodos separados por coma"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
              className="sm:col-span-2 min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
            />
            <select
              aria-label="Unidad de venta"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value as SaleUnitKind)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="PIECE">Por Pieza</option>
              <option value="METER">Por Metro</option>
              <option value="KG">Por Kilo</option>
              <option value="BOX">Por Caja</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Pasillo (P1)"
                value={newAisle}
                onChange={(e) => setNewAisle(e.target.value)}
                className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Estante (E1)"
                value={newShelf}
                onChange={(e) => setNewShelf(e.target.value)}
                className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <input
              type="number"
              step="0.01"
              placeholder="Precio público ($)"
              value={newPublicPesos}
              onChange={(e) => setNewPublicPesos(e.target.value)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
              required
            />
            <input
              type="number"
              step="0.01"
              placeholder="Precio mayoreo ($)"
              value={newWholesalePesos}
              onChange={(e) => setNewWholesalePesos(e.target.value)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Costo unitario ($)"
              value={newCostPesos}
              onChange={(e) => setNewCostPesos(e.target.value)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
            />
            <input
              type="number"
              step="1"
              placeholder="Existencia inicial"
              value={newInitialStock}
              onChange={(e) => setNewInitialStock(e.target.value)}
              className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-50"
          >
            Guardar Producto Nuevo
          </button>
        </form>
      </div>
    </div>
  );
}

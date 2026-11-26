import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type {
  DeliveryMode,
  FerreteriaApp,
  ProductSearchResult,
  QuoteRecord,
  QuoteView,
} from '@ferreteria/core';
import { formatMoneyCents, humanizeError } from '../utils/format';

interface CartDraftLine {
  product: ProductSearchResult;
  quantity: number;
  saleAsPack: boolean;
}

interface CounterViewProps {
  app: FerreteriaApp;
  revision: number;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  requestOwnerPin: (title: string, description: string) => Promise<string | null>;
}

export function CounterView({
  app,
  revision,
  onDataChanged,
  onNotify,
  requestOwnerPin,
}: CounterViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [cart, setCart] = useState<CartDraftLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('COUNTER_IMMEDIATE');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [reserveOnQuote, setReserveOnQuote] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'POS' | 'QUOTES'>('POS');
  const [lastQuoteView, setLastQuoteView] = useState<QuoteView | null>(null);
  const [savedQuotes, setSavedQuotes] = useState<QuoteRecord[]>([]);
  const [customersList, setCustomersList] = useState<Array<{ id: string; displayName: string }>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [prods, custs] = await Promise.all([
        app.searchProducts(query),
        app.listCreditCustomers(),
      ]);
      if (active) {
        setResults(prods);
        setCustomersList(custs.map((c) => ({ id: c.id, displayName: c.displayName })));
        setSavedQuotes(app.listQuotes());
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [app, query, revision]);

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const addToCart = (product: ProductSearchResult, saleAsPack: boolean) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (l) => l.product.itemId === product.itemId && l.saleAsPack === saleAsPack
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, saleAsPack }];
    });
  };

  const updateCartQty = (index: number, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setCart((prev) => prev.map((line, i) => (i === index ? { ...line, quantity } : line)));
  };

  const estimatedTotalCents = useMemo(() => {
    const subtotal = cart.reduce((sum, line) => {
      const unitCents = line.saleAsPack
        ? line.product.packPriceCents ??
          Math.round(line.product.wholesalePriceCents * line.product.unitsPerPack)
        : line.quantity >= line.product.wholesaleMinQty
          ? line.product.wholesalePriceCents
          : line.product.publicPriceCents;
      return sum + Math.round(line.quantity * unitCents);
    }, 0);
    return Math.round(subtotal * (1 - discountPercent / 100));
  }, [cart, discountPercent]);

  const controls = app.getOwnerControls();

  const handleSendToCashier = async () => {
    if (cart.length === 0) {
      onNotify('error', 'Agregue al menos un producto antes de enviar la nota a caja.');
      return;
    }

    try {
      let zeroStockPin: string | undefined;
      let discountPin: string | undefined;

      const hasInsufficientStock = cart.some((l) => {
        const needed = l.saleAsPack ? l.quantity * l.product.unitsPerPack : l.quantity;
        return l.product.availableQty < needed;
      });

      if (hasInsufficientStock && controls.blockZeroStockWithoutOwnerPin) {
        const pin = await requestOwnerPin(
          'Autorización por falta de existencia',
          'Uno o más productos no tienen existencia suficiente en inventario. Ingrese el PIN del Dueño para autorizar esta venta.'
        );
        if (!pin) return;
        zeroStockPin = pin;
      }

      if (discountPercent > controls.sellerMaxDiscountPercent) {
        const pin = await requestOwnerPin(
          'Autorización de descuento mayor',
          `El descuento del ${discountPercent}% supera el tope permitido (${controls.sellerMaxDiscountPercent}%). Ingrese el PIN del Dueño.`
        );
        if (!pin) return;
        discountPin = pin;
      }

      const selectedCust = customersList.find((c) => c.id === selectedCustomerId);
      const res = await app.createParkedSale({
        sellerId: 'seller-1',
        customerId: selectedCustomerId || undefined,
        customerName: selectedCust?.displayName || customerName.trim() || 'Público General',
        deliveryMode,
        discountPercent,
        ownerPinZeroStockOverride: zeroStockPin,
        ownerPinDiscountOverride: discountPin,
        lines: cart.map((l) => ({
          itemId: l.product.itemId,
          quantity: l.quantity,
          saleAsPack: l.saleAsPack,
        })),
      });

      setCart([]);
      setDiscountPercent(0);
      setCustomerName('');
      onDataChanged();
      onNotify(
        'success',
        `Nota ${res.orderId} enviada a Caja (${formatMoneyCents(res.grandTotalCents)}).`
      );
    } catch (err) {
      app.logError({ screen: 'Mostrador', action: 'Enviar a caja', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleSaveQuote = async () => {
    if (cart.length === 0) {
      onNotify('error', 'Agregue productos para generar la cotización.');
      return;
    }
    const targetName =
      customersList.find((c) => c.id === selectedCustomerId)?.displayName ||
      customerName.trim() ||
      'Cliente Mostrador';

    try {
      const q = await app.createQuote({
        customerName: targetName,
        customerId: selectedCustomerId || undefined,
        reserveStock: reserveOnQuote,
        lines: cart.map((l) => ({
          itemId: l.product.itemId,
          quantity: l.quantity,
          saleAsPack: l.saleAsPack,
        })),
      });
      setLastQuoteView(q);
      setCart([]);
      setActiveSubTab('QUOTES');
      onDataChanged();
      onNotify('success', `Cotización ${q.quoteId} guardada correctamente.`);
    } catch (err) {
      app.logError({ screen: 'Mostrador', action: 'Crear cotización', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleRecalculateQuote = async (quoteId: string) => {
    try {
      const updated = await app.recalculateQuotePrices(quoteId);
      setLastQuoteView(updated);
      onDataChanged();
      onNotify('success', `Precios de la cotización ${quoteId} actualizados al día de hoy.`);
    } catch (err) {
      app.logError({ screen: 'Cotizaciones', action: 'Recalcular precios', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleConvertQuote = async (quoteId: string) => {
    try {
      const res = await app.convertQuoteToParkedOrder({
        quoteId,
        sellerId: 'seller-1',
        deliveryMode,
      });
      onDataChanged();
      onNotify(
        'success',
        `Cotización convertida a nota en espera ${res.orderId} (${formatMoneyCents(res.grandTotalCents)}). Pase a Caja para cobrar.`
      );
    } catch (err) {
      app.logError({ screen: 'Cotizaciones', action: 'Convertir a venta', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleCopyWhatsApp = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify('success', 'Resumen copiado. Listo para pegar en WhatsApp.');
    } catch {
      onNotify('info', 'Seleccione el texto del resumen para copiarlo manualmente.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Mostrador y Cotizaciones
          </h2>
          <p className="text-sm text-slate-600">
            Busque por nombre, apodo o medida (atajo: tecla{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-200 rounded text-xs font-mono">/</kbd>) y envíe
            la nota a Caja.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('POS')}
            className={`min-h-[40px] px-4 rounded-md text-sm font-medium transition-colors ${
              activeSubTab === 'POS'
                ? 'bg-[#1E3A5F] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Armar Nota
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('QUOTES')}
            className={`min-h-[40px] px-4 rounded-md text-sm font-medium transition-colors ${
              activeSubTab === 'QUOTES'
                ? 'bg-[#1E3A5F] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Cotizaciones ({savedQuotes.filter((q) => q.status !== 'CONVERTED').length})
          </button>
        </div>
      </div>

      {activeSubTab === 'POS' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Buscador y resultados */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <label htmlFor="pos-search" className="sr-only">
                Buscar producto por nombre, apodo o medida
              </label>
              <div className="relative">
                <Search
                  className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                  strokeWidth={1.75}
                />
                <input
                  ref={searchInputRef}
                  id="pos-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Ej. "codo 1/2", "pija negra", "cable 12", "cemento"...'
                  className="w-full min-h-[48px] pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] focus:bg-white"
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 shadow-xs">
              {results.length === 0 ? (
                <div className="p-8 text-center text-slate-600">
                  No se encontraron artículos que coincidan con "{query}".
                </div>
              ) : (
                results.map((item) => (
                  <div
                    key={item.itemId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 text-base">
                          {item.officialName}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                          <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
                          {item.aisle} · {item.shelf}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                        <span>Código: {item.sku}</span>
                        {item.aliases.length > 0 && (
                          <span>Apodos: {item.aliases.join(', ')}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-sm tabular-nums">
                        <span className="font-semibold text-[#1E3A5F]">
                          Público: {formatMoneyCents(item.publicPriceCents)}
                        </span>
                        <span className="text-slate-600">
                          Mayoreo ({item.wholesaleMinQty}+):{' '}
                          {formatMoneyCents(item.wholesalePriceCents)}
                        </span>
                        <span
                          className={`font-semibold ${
                            item.availableQty <= 0
                              ? 'text-red-600'
                              : item.isLowStock
                                ? 'text-amber-600'
                                : 'text-emerald-700'
                          }`}
                        >
                          Stock: {item.availableQty}{' '}
                          {item.baseUnit === 'METER'
                            ? 'm'
                            : item.baseUnit === 'KG'
                              ? 'kg'
                              : 'pzas'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => addToCart(item, false)}
                        className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#162D4A] active:scale-[0.98]"
                      >
                        <Plus className="w-4 h-4" strokeWidth={1.75} />
                        Agregar {item.baseUnit === 'METER' ? 'm' : item.baseUnit === 'KG' ? 'kg' : 'pza'}
                      </button>
                      {item.packLabel && item.unitsPerPack > 1 && (
                        <button
                          type="button"
                          onClick={() => addToCart(item, true)}
                          className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 active:scale-[0.98]"
                        >
                          <Package className="w-4 h-4" strokeWidth={1.75} />
                          {item.packLabel}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Nota actual */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
                <h3 className="text-lg font-semibold text-slate-900">Nota Actual</h3>
              </div>
              <span className="text-sm font-medium text-slate-600 tabular-nums">
                {cart.length} renglones
              </span>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Seleccione productos de la lista para armar una nota de venta o cotización.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                {cart.map((line, idx) => (
                  <div
                    key={`${line.product.itemId}-${line.saleAsPack ? 'pack' : 'base'}`}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {line.product.officialName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {line.saleAsPack
                          ? line.product.packLabel ?? 'Caja cerrada'
                          : line.product.baseUnit === 'METER'
                            ? 'Por metro'
                            : line.product.baseUnit === 'KG'
                              ? 'Por kilo'
                              : 'Por pieza'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={line.product.baseUnit === 'METER' || line.product.baseUnit === 'KG' ? '0.5' : '1'}
                        min="0.1"
                        value={line.quantity}
                        onChange={(e) => updateCartQty(idx, Number(e.target.value))}
                        aria-label={`Cantidad para ${line.product.officialName}`}
                        className="w-20 min-h-[40px] px-2 border border-slate-300 rounded-lg text-center text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => updateCartQty(idx, 0)}
                        aria-label="Quitar producto"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-slate-200 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pos-customer-select" className="block text-xs font-medium text-slate-600 mb-1">
                    Cliente registrado (opcional)
                  </label>
                  <select
                    id="pos-customer-select"
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Público General</option>
                    {customersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pos-customer-name" className="block text-xs font-medium text-slate-600 mb-1">
                    Nombre en nota / cotización
                  </label>
                  <input
                    id="pos-customer-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej. Maestro López"
                    className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pos-delivery-mode" className="block text-xs font-medium text-slate-600 mb-1">
                    Forma de entrega
                  </label>
                  <select
                    id="pos-delivery-mode"
                    value={deliveryMode}
                    onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                    className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="COUNTER_IMMEDIATE">Entregado en mostrador</option>
                    <option value="WAREHOUSE_PICKUP">Por recoger en bodega</option>
                    <option value="HOME_DELIVERY">Envío a domicilio</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="pos-discount" className="block text-xs font-medium text-slate-600 mb-1">
                    Descuento % (tope vendedor: {controls.sellerMaxDiscountPercent}%)
                  </label>
                  <input
                    id="pos-discount"
                    type="number"
                    min={0}
                    max={50}
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
                    className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 pt-1">
                <input
                  type="checkbox"
                  checked={reserveOnQuote}
                  onChange={(e) => setReserveOnQuote(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1E3A5F]"
                />
                Apartar material en inventario si se guarda como cotización
              </label>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-base font-medium text-slate-700">Total estimado</span>
                <span className="text-2xl font-bold text-[#1E3A5F] tabular-nums">
                  {formatMoneyCents(estimatedTotalCents)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleSaveQuote}
                  className="min-h-[48px] px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold inline-flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-[0.98]"
                >
                  <FileText className="w-4 h-4" strokeWidth={1.75} />
                  Guardar Cotización
                </button>
                <button
                  type="button"
                  onClick={handleSendToCashier}
                  className="min-h-[48px] px-4 py-2.5 rounded-lg bg-[#1E3A5F] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[#162D4A] active:scale-[0.98]"
                >
                  <Send className="w-4 h-4" strokeWidth={1.75} />
                  Enviar a Caja
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 shadow-xs">
            {savedQuotes.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Aún no hay cotizaciones registradas.
              </div>
            ) : (
              savedQuotes.map((q) => (
                <div
                  key={q.quoteId}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{q.customerName}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          q.status === 'CONVERTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : q.status === 'RESERVED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {q.status === 'CONVERTED'
                          ? 'Convertida'
                          : q.status === 'RESERVED'
                            ? 'Material Apartado'
                            : 'Pendiente'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Folio: {q.quoteId} · {new Date(q.updatedAt).toLocaleString('es-MX')}
                    </p>
                  </div>

                  {q.status !== 'CONVERTED' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRecalculateQuote(q.quoteId)}
                        className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-slate-50"
                      >
                        <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
                        Recalcular precios
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConvertQuote(q.quoteId)}
                        className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#162D4A]"
                      >
                        <Check className="w-4 h-4" strokeWidth={1.75} />
                        Convertir a Venta
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">Resumen para WhatsApp</h3>
            {lastQuoteView ? (
              <>
                <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-800 font-sans">
                  {lastQuoteView.whatsappSummary}
                </pre>
                <button
                  type="button"
                  onClick={() => handleCopyWhatsApp(lastQuoteView.whatsappSummary)}
                  className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 text-white font-medium inline-flex items-center justify-center gap-2 hover:bg-emerald-800"
                >
                  <Copy className="w-4 h-4" strokeWidth={1.75} />
                  Copiar texto para WhatsApp
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Guarde o recalcule una cotización para ver aquí el formato listo para enviar por
                WhatsApp.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { CheckSquare, ClipboardCheck, MapPin, Truck } from 'lucide-react';
import type { FerreteriaApp, ProductSearchResult, WarehouseDispatch } from '@ferreteria/core';
import { humanizeError } from '../utils/format';

interface WarehouseViewProps {
  app: FerreteriaApp;
  revision: number;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function WarehouseView({
  app,
  revision,
  onDataChanged,
  onNotify,
}: WarehouseViewProps) {
  const [queue, setQueue] = useState<WarehouseDispatch[]>([]);
  const [aisleFilter, setAisleFilter] = useState('P1');
  const [aisleItems, setAisleItems] = useState<ProductSearchResult[]>([]);
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      const items = await app.getProductsByAisleOrCategory({ aisle: aisleFilter });
      if (active) {
        setQueue(app.listWarehouseAuthorizedQueue());
        setAisleItems(items);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [app, aisleFilter, revision]);

  const handleDispatch = async (orderId: string) => {
    try {
      await app.dispatchWarehouseOrder({ orderId, warehouseUserId: 'warehouse-1' });
      onDataChanged();
      onNotify('success', `Pedido ${orderId} marcado como entregado en bodega/patio.`);
    } catch (err) {
      app.logError({ screen: 'Bodega', action: 'Entregar pedido', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleSaveCycleCount = async () => {
    const counts = aisleItems
      .map((item) => ({
        itemId: item.itemId,
        raw: physicalCounts[item.itemId],
      }))
      .filter((x) => x.raw !== undefined && x.raw !== '')
      .map((x) => ({
        itemId: x.itemId,
        physicalQty: Number(x.raw),
      }));

    if (counts.length === 0) {
      onNotify('info', 'Ingrese al menos una cantidad contada físicamente.');
      return;
    }

    try {
      const diffs = await app.recordQuickCycleCount({
        userId: 'warehouse-1',
        counts,
      });
      const adjusted = diffs.filter((d) => d.deltaQty !== 0).length;
      setPhysicalCounts({});
      onDataChanged();
      onNotify(
        'success',
        `Conteo del pasillo ${aisleFilter} guardado (${adjusted} ajustes aplicados).`
      );
    } catch (err) {
      app.logError({ screen: 'Bodega', action: 'Conteo rápido', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Bodega, Patio y Entregas Autorizadas
        </h2>
        <p className="text-sm text-slate-600">
          Aquí aparecen únicamente los pedidos ya pagados o con crédito autorizado en Caja.
        </p>
      </div>

      {/* Cola de entregas */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
          <Truck className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
          Pedidos Pendientes de Surtir / Cargar ({queue.length})
        </h3>

        {queue.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No hay pedidos pendientes de entrega en bodega.
          </p>
        ) : (
          <div className="space-y-4">
            {queue.map((order) => (
              <div
                key={order.orderId}
                className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-base">
                        {order.customerName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          order.authorizationKind === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {order.authorizationKind === 'PAID'
                          ? 'Pagado en Caja'
                          : 'Crédito Autorizado'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Nota: {order.orderId} ·{' '}
                      {order.deliveryMode === 'HOME_DELIVERY'
                        ? 'Envío a domicilio'
                        : 'Recolección en bodega'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDispatch(order.orderId)}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-emerald-800 active:scale-[0.98]"
                  >
                    <CheckSquare className="w-4 h-4" strokeWidth={1.75} />
                    Marcar como Entregado
                  </button>
                </div>

                <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                  {order.itemsSummary.map((line) => (
                    <li
                      key={line.itemId}
                      className="px-3.5 py-2.5 flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-slate-900">
                        {line.quantity} {line.unitLabel} — {line.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
                        {line.aisle} · {line.shelf}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conteo rápido por pasillo */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
              Conteo Rápido por Pasillo (Sin cerrar la tienda)
            </h3>
            <p className="text-xs text-slate-500">
              Seleccione un pasillo para revisar existencias físicas y ajustar diferencias.
            </p>
          </div>

          <select
            aria-label="Seleccionar pasillo para conteo"
            value={aisleFilter}
            onChange={(e) => setAisleFilter(e.target.value)}
            className="min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm bg-white font-medium"
          >
            <option value="P1">Pasillo P1 (Eléctrico / Herramientas)</option>
            <option value="P2">Pasillo P2 (Tornillería)</option>
            <option value="P3">Pasillo P3 (Plomería)</option>
            <option value="PATIO">Patio (Construcción)</option>
          </select>
        </div>

        {aisleItems.length === 0 ? (
          <p className="text-sm text-slate-500">No hay productos registrados en este pasillo.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {aisleItems.map((item) => (
              <div
                key={item.itemId}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{item.officialName}</p>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Sistema marca: {item.availableQty} · Estante {item.shelf}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`count-${item.itemId}`} className="text-xs text-slate-600">
                    Conteo físico:
                  </label>
                  <input
                    id={`count-${item.itemId}`}
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder={String(item.availableQty)}
                    value={physicalCounts[item.itemId] ?? ''}
                    onChange={(e) =>
                      setPhysicalCounts((prev) => ({
                        ...prev,
                        [item.itemId]: e.target.value,
                      }))
                    }
                    className="w-28 min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveCycleCount}
            className="min-h-[44px] px-5 py-2 rounded-lg bg-[#1E3A5F] text-white font-semibold hover:bg-[#162D4A]"
          >
            Guardar Conteo del Pasillo
          </button>
        </div>
      </div>
    </div>
  );
}

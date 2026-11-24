import { useMemo } from "react";
import {
  Award,
  BarChart3,
  DollarSign,
  Receipt,
  ShieldAlert,
} from "lucide-react";
import {
  addCents,
  formatMXN,
  multiplyCents,
  subtractCents,
} from "../core/ferre-store.js";
import type {
  AuditEntry,
  CashShift,
  FerreProduct,
  FerreSale,
} from "../core/ferre-types.js";

interface ReportsAuditViewProps {
  sales: FerreSale[];
  shifts: CashShift[];
  products: FerreProduct[];
  auditLog: AuditEntry[];
}

export function ReportsAuditView({
  sales,
  shifts,
  products,
  auditLog,
}: ReportsAuditViewProps) {
  const metrics = useMemo(() => {
    const completed = sales.filter((s) => s.status === "completed");
    let revenueCents = 0;
    let costCents = 0;
    const byProduct = new Map<
      string,
      { name: string; qty: number; revenueCents: number }
    >();

    for (const sale of completed) {
      revenueCents = addCents(revenueCents, sale.totalCents);
      for (const item of sale.items) {
        costCents = addCents(
          costCents,
          multiplyCents(item.unitCostCents, item.quantity)
        );
        const curr = byProduct.get(item.productId);
        if (curr) {
          curr.qty = Number((curr.qty + item.quantity).toFixed(3));
          curr.revenueCents = addCents(curr.revenueCents, item.subtotalCents);
        } else {
          byProduct.set(item.productId, {
            name: item.name,
            qty: item.quantity,
            revenueCents: item.subtotalCents,
          });
        }
      }
    }

    const profitCents = subtractCents(revenueCents, costCents);
    const avgTicketCents =
      completed.length > 0 ? Math.round(revenueCents / completed.length) : 0;
    const lowStockCount = products.filter(
      (p) => p.active && p.stock <= p.minStock
    ).length;

    const topProducts = [...byProduct.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 5);

    const cashDiffTotal = shifts.reduce(
      (acc, s) =>
        s.differenceCents !== undefined ? addCents(acc, s.differenceCents) : acc,
      0
    );

    return {
      revenueCents,
      profitCents,
      ticketsCount: completed.length,
      avgTicketCents,
      lowStockCount,
      topProducts,
      cashDiffTotal,
    };
  }, [sales, shifts, products]);

  return (
    <div className="space-y-6">
      {/* Indicadores clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Ventas totales</span>
            <DollarSign className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {formatMXN(metrics.revenueCents)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.ticketsCount} tickets cobrados
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Utilidad estimada</span>
            <BarChart3 className="w-4 h-4 text-slate-700" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2 tabular-nums">
            {formatMXN(metrics.profitCents)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Venta menos costo de mercancía
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Ticket promedio</span>
            <Receipt className="w-4 h-4 text-slate-700" strokeWidth={1.75} />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
            {formatMXN(metrics.avgTicketCents)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.lowStockCount} productos por resurtir
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Diferencias en caja</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
          </div>
          <p
            className={`text-2xl font-bold mt-2 tabular-nums ${
              metrics.cashDiffTotal === 0 ? "text-slate-900" : "text-red-700"
            }`}
          >
            {metrics.cashDiffTotal >= 0 ? "+" : ""}
            {formatMXN(metrics.cashDiffTotal)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Acumulado en cortes cerrados
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Productos estrella */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-slate-900">
              Productos más vendidos
            </h2>
          </div>
          {metrics.topProducts.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              Cobre su primera venta para ver los productos estrella.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {metrics.topProducts.map((tp, idx) => (
                <div
                  key={tp.name}
                  className="py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {idx + 1}. {tp.name}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {tp.qty} unidades vendidas
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatMXN(tp.revenueCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bitácora Anti-Robo */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-5 h-5 text-slate-800" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-slate-900">
              Bitácora de Control Anti-Robo ({auditLog.length})
            </h2>
          </div>
          {auditLog.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              Aquí aparecerán cancelaciones, descuentos, ajustes de inventario y
              movimientos de efectivo.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
              {auditLog.map((entry) => (
                <div key={entry.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {entry.userName}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {new Date(entry.createdAt).toLocaleString("es-MX")}
                    </span>
                  </div>
                  <p className="text-slate-700 mt-0.5">{entry.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

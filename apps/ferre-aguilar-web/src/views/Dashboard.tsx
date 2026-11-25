import { AlertTriangle, BarChart3, Percent, Receipt, ShieldAlert, TrendingUp } from 'lucide-react';
import { useApp, useLoad } from '../app-context';
import type { Ferre } from '../data/ferre';
import { computeKpis, mxn } from '../data/kpis';
import { Card, Empty, Skeleton } from '../ui/kit';

const loadDash = async (f: Ferre) => ({
  tickets: await f.listTickets(), products: await f.listProducts(), audit: await f.listAudit(),
});

function Kpi({ icon, label, value, tone = '' }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="flex items-center gap-2 text-sm text-muted"><span aria-hidden>{icon}</span>{label}</p>
      <p className={`num mt-1 text-3xl font-bold ${tone || 'text-navy'}`}>{value}</p>
    </div>
  );
}

export function Dashboard() {
  const { ferre, session } = useApp();
  const { data, loading } = useLoad(loadDash);
  if (loading || !data) return <Skeleton rows={6} />;
  const k = computeKpis(data.tickets, data.products, data.audit, new Date());
  const showMoney = ferre.can(session, 'reports:financial');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={<TrendingUp size={18} />} label="Ventas de hoy" value={mxn(k.salesCents)} />
        <Kpi icon={<Receipt size={18} />} label="Tickets / promedio" value={`${k.ticketCount} · ${mxn(k.avgTicketCents)}`} />
        {showMoney && <Kpi icon={<Percent size={18} />} label="Ganancia bruta" value={mxn(k.grossProfitCents)} tone="text-ok" />}
        <Kpi icon={<ShieldAlert size={18} />} label="Cancelaciones" value={`${k.voidedCount} · ${mxn(k.voidedCents)}`} tone={k.voidedCount ? 'text-danger' : ''} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Lo más vendido hoy">
          {k.topProducts.length === 0 ? <Empty icon={<BarChart3 size={36} />} title="Sin ventas hoy" text="Cuando vendas, aquí verás los productos estrella." /> : (
            <ol className="divide-y divide-line">
              {k.topProducts.map((p) => (
                <li key={p.name} className="flex justify-between py-2"><span>{p.name} <span className="num text-muted">× {p.quantity}</span></span><span className="num font-semibold">{mxn(p.revenueCents)}</span></li>
              ))}
            </ol>
          )}
        </Card>
        <Card title={`Por surtir (${k.lowStock.length})`}>
          {k.lowStock.length === 0 ? <p className="text-muted">Todo en orden.</p> : (
            <ul className="divide-y divide-line">
              {k.lowStock.map((p) => (
                <li key={p.id} className="flex justify-between py-2"><span>{p.name}</span><span className="num font-semibold text-danger">{p.stock} / mín. {p.minStock}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Alertas de hoy">
        {k.alerts.length === 0 ? <p className="text-muted">Sin alertas. Buen día.</p> : (
          <ul className="space-y-2">
            {k.alerts.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-red-800"><AlertTriangle size={18} className="mt-1 shrink-0" aria-hidden />{a.userName}: {a.detail}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useLoad } from '../app-context';
import type { Ferre } from '../data/ferre';
import { Card, Empty, Skeleton } from '../ui/kit';

const loadAudit = (f: Ferre) => f.listAudit();

export function AuditLog() {
  const { data, loading } = useLoad(loadAudit);
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  if (loading || !data) return <Skeleton rows={6} />;
  const rows = (onlyAlerts ? data.filter((a) => a.risk === 'alert') : data).slice(0, 200);
  return (
    <Card title="Bitácora de movimientos" action={
      <label className="flex min-h-11 items-center gap-2 text-base">
        <input type="checkbox" className="size-5 accent-orange-600" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} /> Solo alertas
      </label>}>
      {rows.length === 0 ? <Empty icon={<ScrollText size={40} />} title="Sin registros" text="Aquí aparece quién hizo qué y a qué hora." /> : (
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-2">
              <span className={`mt-1 inline-block size-3 shrink-0 rounded-full ${a.risk === 'alert' ? 'bg-danger' : 'bg-slate-300'}`} aria-label={a.risk === 'alert' ? 'Alerta' : 'Normal'} />
              <span className="min-w-0 flex-1"><strong>{a.userName}</strong> · {a.detail}
                <span className="num block text-sm text-muted">{new Date(a.at).toLocaleString('es-MX')}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

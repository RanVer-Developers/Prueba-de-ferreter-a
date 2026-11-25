import { ArrowDownToLine, ArrowUpFromLine, Ban, Lock, Unlock, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApp, useLoad } from '../app-context';
import type { Ferre } from '../data/ferre';
import { mxn } from '../data/kpis';
import { Alert, Button, Card, Empty, Field, Modal, Skeleton, inputCls, toCents } from '../ui/kit';

const loadCash = async (f: Ferre) => {
  const shift = await f.getOpenShift();
  return {
    shift,
    expected: shift ? await f.expectedCash(shift.id) : 0,
    movements: shift ? (await f.listMovements()).filter((m) => m.shiftId === shift.id) : [],
    tickets: (await f.listTickets()).filter((t) => shift && t.shiftId === shift.id),
    lastClosed: (await f.listShifts()).find((s) => s.status === 'CLOSED') ?? null,
  };
};

export function Cash() {
  const { ferre, session, refresh } = useApp();
  const { data, loading } = useLoad(loadCash);
  const [opening, setOpening] = useState(false);
  const [moving, setMoving] = useState<'IN' | 'OUT' | null>(null);
  const [closing, setClosing] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [result, setResult] = useState<{ expected: number; diff: number } | null>(null);
  const canSeeExpected = ferre.can(session, 'cashier:void'); // supervisors see it; cashier counts blind

  if (loading || !data) return <Skeleton rows={5} />;
  const { shift } = data;

  if (!shift) {
    return (
      <Card>
        <Empty icon={<Lock size={40} />} title="La caja está cerrada" text="Cuenta el fondo inicial y ábrela para empezar a cobrar." />
        {data.lastClosed && <p className="num mb-3 text-center text-muted">Último corte: {mxn(data.lastClosed.declaredCents ?? 0)} contados</p>}
        <div className="flex justify-center"><Button onClick={() => setOpening(true)}><Unlock size={20} aria-hidden /> Abrir caja</Button></div>
        {opening && (
          <AmountModal title="Abrir caja" label="Fondo inicial (efectivo)" action="Abrir caja" onClose={() => setOpening(false)}
            onSubmit={async (cents) => { await ferre.openShift(session, cents); toast.success('Caja abierta'); setOpening(false); refresh(); }} />
        )}
        {result && <CutResult {...result} onClose={() => setResult(null)} />}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card title="Caja abierta" action={<span className="text-sm text-muted">Desde {new Date(shift.openedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {shift.cashierName}</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Fondo inicial" value={mxn(shift.initialCents)} />
          <Stat label="Ventas del turno" value={String(data.tickets.filter((t) => t.status === 'COMPLETED').length)} />
          <Stat label="Efectivo esperado" value={canSeeExpected ? mxn(data.expected) : 'Se muestra al cortar'} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setMoving('IN')}><ArrowDownToLine size={20} aria-hidden /> Entrada de efectivo</Button>
          <Button variant="ghost" onClick={() => setMoving('OUT')}><ArrowUpFromLine size={20} aria-hidden /> Salida de efectivo</Button>
          <Button variant="secondary" onClick={() => setClosing(true)}><Wallet size={20} aria-hidden /> Corte de caja</Button>
        </div>
      </Card>

      <Card title="Movimientos de efectivo">
        {data.movements.length === 0 ? <p className="text-muted">Sin movimientos todavía.</p> : (
          <ul className="divide-y divide-line">
            {data.movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <span>{m.concept}<span className="block text-sm text-muted">{m.byName} · {new Date(m.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></span>
                <span className={`num text-lg font-semibold ${m.kind === 'IN' ? 'text-ok' : 'text-danger'}`}>{m.kind === 'IN' ? '+' : '−'}{mxn(m.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Ventas del turno">
        {data.tickets.length === 0 ? <p className="text-muted">Aún no hay ventas.</p> : (
          <ul className="divide-y divide-line">
            {data.tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <span className={t.status === 'VOIDED' ? 'text-slate-500 line-through' : ''}>
                  {t.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  <span className="block text-sm text-muted">{t.cashierName} · {new Date(t.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}{t.status === 'VOIDED' ? ` · Cancelado: ${t.voidReason}` : ''}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="num text-lg font-semibold">{mxn(t.totalCents)}</span>
                  {t.status === 'COMPLETED' && <Button variant="ghost" aria-label="Cancelar ticket" onClick={() => setVoiding(t.id)}><Ban size={18} /></Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {moving && (
        <MovementModal kind={moving} onClose={() => setMoving(null)}
          onSubmit={async (cents, concept) => { await ferre.cashMovement(session, moving, cents, concept); toast.success('Movimiento guardado'); setMoving(null); refresh(); }} />
      )}
      {closing && (
        <AmountModal title="Corte de caja" label="Cuenta el efectivo que hay en la gaveta" action="Hacer corte" onClose={() => setClosing(false)}
          hint="No te mostramos cuánto debería haber; cuenta con calma."
          onSubmit={async (cents) => {
            const r = await ferre.closeShift(session, cents);
            setClosing(false); setResult({ expected: r.expectedCents, diff: r.differenceCents }); refresh();
          }} />
      )}
      {voiding && <VoidModal onClose={() => setVoiding(null)} onSubmit={async (reason, supId, pin) => { await ferre.voidTicket(session, voiding, reason, supId, pin); toast.success('Ticket cancelado'); setVoiding(null); refresh(); }} />}
      {result && <CutResult {...result} onClose={() => setResult(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><p className="text-sm text-muted">{label}</p><p className="num text-xl font-bold text-navy">{value}</p></div>;
}

function CutResult({ expected, diff, onClose }: { expected: number; diff: number; onClose: () => void }) {
  return (
    <Modal title="Corte terminado" onClose={onClose}>
      <p className="num text-lg">Debía haber: <strong>{mxn(expected)}</strong></p>
      <p className={`num mt-2 text-3xl font-bold ${diff === 0 ? 'text-ok' : 'text-danger'}`}>
        {diff === 0 ? 'Cuadra perfecto' : diff < 0 ? `Faltan ${mxn(-diff)}` : `Sobran ${mxn(diff)}`}
      </p>
      {diff !== 0 && <p className="mt-2 text-muted">La diferencia quedó registrada en la bitácora para el Dueño.</p>}
      <Button className="mt-4 w-full" onClick={onClose}>Entendido</Button>
    </Modal>
  );
}

function useSubmit(onSubmit: () => Promise<void>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setError('');
    try { await onSubmit(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); setBusy(false); }
  };
  return { error, busy, run };
}

function AmountModal({ title, label, action, hint, onClose, onSubmit }: { title: string; label: string; action: string; hint?: string; onClose: () => void; onSubmit: (cents: number) => Promise<void> }) {
  const [v, setV] = useState('');
  const { error, busy, run } = useSubmit(() => onSubmit(toCents(v)));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <Field label={label} hint={hint}><input inputMode="decimal" className={`${inputCls} num text-2xl`} value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" onKeyDown={(e) => e.key === 'Enter' && run()} /></Field>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy || v === ''} onClick={run}>{action}</Button>
      </div>
    </Modal>
  );
}

function MovementModal({ kind, onClose, onSubmit }: { kind: 'IN' | 'OUT'; onClose: () => void; onSubmit: (cents: number, concept: string) => Promise<void> }) {
  const [v, setV] = useState('');
  const [c, setC] = useState('');
  const { error, busy, run } = useSubmit(() => onSubmit(toCents(v), c));
  return (
    <Modal title={kind === 'IN' ? 'Entrada de efectivo' : 'Salida de efectivo'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Monto"><input inputMode="decimal" className={`${inputCls} num text-2xl`} value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" /></Field>
        <Field label="¿Para qué es?"><input className={inputCls} value={c} onChange={(e) => setC(e.target.value)} placeholder={kind === 'OUT' ? 'Ej. pago de flete' : 'Ej. cambio del banco'} /></Field>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy} onClick={run}>Guardar</Button>
      </div>
    </Modal>
  );
}

function VoidModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string, supervisorId: string, pin: string) => Promise<void> }) {
  const { ferre } = useApp();
  const { data } = useLoad(async (f: Ferre) => (await f.listStaff()).filter((s) => s.roleCode === 'MANAGER' || s.roleCode === 'OWNER'));
  const [reason, setReason] = useState('');
  const [sup, setSup] = useState('');
  const [pin, setPin] = useState('');
  const { error, busy, run } = useSubmit(() => onSubmit(reason, sup || data?.[0]?.id || '', pin));
  void ferre;
  return (
    <Modal title="Cancelar ticket" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-muted">Para cancelar se necesita la autorización del Encargado o del Dueño.</p>
        <Field label="Motivo"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. el cliente se arrepintió" /></Field>
        <Field label="Quién autoriza">
          <select className={inputCls} value={sup} onChange={(e) => setSup(e.target.value)}>
            {data?.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </select>
        </Field>
        <Field label="PIN de quien autoriza"><input type="password" inputMode="numeric" className={inputCls} value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
        {error && <Alert>{error}</Alert>}
        <Button variant="danger" className="w-full" disabled={busy || pin.length < 4} onClick={run}>Cancelar ticket</Button>
      </div>
    </Modal>
  );
}

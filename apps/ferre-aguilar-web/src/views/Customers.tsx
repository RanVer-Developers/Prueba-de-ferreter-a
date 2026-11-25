import { Banknote, CreditCard, Landmark, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApp, useLoad } from '../app-context';
import type { Ferre } from '../data/ferre';
import { mxn } from '../data/kpis';
import type { CustomerRecord } from '../data/types';
import { Alert, Button, Card, Empty, Field, Modal, Skeleton, inputCls, toCents } from '../ui/kit';

const loadCustomers = async (f: Ferre) => ({
  customers: await f.listCustomers(),
  payments: await f.listCreditPayments(),
  shift: await f.getOpenShift(),
});

export function Customers() {
  const { ferre, session, refresh } = useApp();
  const { data, loading } = useLoad(loadCustomers);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [payingFor, setPayingFor] = useState<CustomerRecord | null>(null);
  const canManage = ferre.can(session, 'customers:manage');
  const canPay = ferre.can(session, 'customers:credit_payment');

  if (loading || !data) return <Skeleton rows={6} />;
  const t = q.trim().toLowerCase();
  const list = data.customers.filter((c) => !t || c.displayName.toLowerCase().includes(t) || c.phone.includes(t));
  const totalDebt = data.customers.reduce((s, c) => s + c.creditUsedCents, 0);

  return (
    <div className="space-y-4">
      <Card
        title={`Clientes (${data.customers.length}) · Por cobrar: ${mxn(totalDebt)}`}
        action={canManage ? <Button variant="ghost" onClick={() => setCreating(true)}><UserPlus size={20} aria-hidden /> Nuevo cliente</Button> : undefined}
      >
        <input aria-label="Buscar cliente" className={`${inputCls} mb-3`} placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.length === 0 ? (
          <Empty icon={<Users size={40} />} title="Sin clientes" text="Agrega un cliente para manejar ventas a crédito." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead className="text-sm text-muted">
                <tr>
                  <th className="py-2">Cliente</th>
                  <th className="text-right">Límite</th>
                  <th className="text-right">Adeudo</th>
                  <th className="text-right">Disponible</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => {
                  const avail = Math.max(0, c.creditLimitCents - c.creditUsedCents);
                  return (
                    <tr key={c.id}>
                      <td className="py-2">
                        <span className="font-medium">{c.displayName}</span>
                        <span className="block text-sm text-muted">{c.phone || 'Sin teléfono'} · Plazo {c.creditTermDays} días</span>
                      </td>
                      <td className="num text-right text-muted">{mxn(c.creditLimitCents)}</td>
                      <td className={`num text-right text-lg font-semibold ${c.creditUsedCents > 0 ? 'text-danger' : ''}`}>{mxn(c.creditUsedCents)}</td>
                      <td className="num text-right text-ok font-semibold">{mxn(avail)}</td>
                      <td className="text-right">
                        {canPay && c.creditUsedCents > 0 && (
                          <Button variant="secondary" disabled={!data.shift} onClick={() => setPayingFor(c)}>
                            <Banknote size={18} aria-hidden /> Abonar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Abonos recientes">
        {data.payments.length === 0 ? (
          <p className="text-muted">Todavía no hay abonos registrados.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.payments.slice(0, 10).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <span>
                  {p.customerName}
                  <span className="block text-sm text-muted">Recibió {p.byName} · {new Date(p.at).toLocaleString('es-MX')}</span>
                </span>
                <span className="num text-lg font-semibold text-ok">+{mxn(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {creating && (
        <NewCustomerModal
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            await ferre.createCustomer(session, v);
            toast.success('Cliente guardado');
            setCreating(false);
            refresh();
          }}
        />
      )}
      {payingFor && (
        <PaymentModal
          customer={payingFor}
          onClose={() => setPayingFor(null)}
          onSubmit={async (amountCents, method, notes) => {
            await ferre.recordCreditPayment(session, { customerId: payingFor.id, amountCents, method, notes });
            toast.success('Abono registrado en caja');
            setPayingFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return {
    error, busy,
    run: async () => {
      setBusy(true); setError('');
      try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); setBusy(false); }
    },
  };
}

function NewCustomerModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (v: { displayName: string; phone: string; creditLimitCents: number; creditTermDays: number }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [limit, setLimit] = useState('2000');
  const [days, setDays] = useState('15');
  const { error, busy, run } = useSubmit(() =>
    onSubmit({ displayName: name, phone, creditLimitCents: toCents(limit), creditTermDays: Number(days) || 0 })
  );
  return (
    <Modal title="Nuevo cliente" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre o razón social"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Ferretería y Plomería Sur" /></Field>
        <Field label="Teléfono"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="477-000-0000" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Límite de crédito"><input inputMode="decimal" className={`${inputCls} num`} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
          <Field label="Días de plazo"><input inputMode="numeric" className={`${inputCls} num`} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy} onClick={run}>Guardar cliente</Button>
      </div>
    </Modal>
  );
}

const PAY_METHODS: { id: 'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER'; label: string; icon: typeof Banknote }[] = [
  { id: 'CASH', label: 'Efectivo', icon: Banknote },
  { id: 'DEBIT_CARD', label: 'Tarjeta', icon: CreditCard },
  { id: 'BANK_TRANSFER', label: 'Transferencia', icon: Landmark },
];

function PaymentModal({ customer, onClose, onSubmit }: { customer: CustomerRecord; onClose: () => void; onSubmit: (amountCents: number, method: 'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER', notes: string) => Promise<void> }) {
  const [amount, setAmount] = useState(String(customer.creditUsedCents / 100));
  const [method, setMethod] = useState<'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER'>('CASH');
  const [notes, setNotes] = useState('');
  const { error, busy, run } = useSubmit(() => onSubmit(toCents(amount), method, notes));
  return (
    <Modal title={`Abono: ${customer.displayName}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="num text-lg">Adeudo actual: <strong className="text-danger">{mxn(customer.creditUsedCents)}</strong></p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pago">
          {PAY_METHODS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={method === id} onClick={() => setMethod(id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-md border-2 text-sm font-semibold ${method === id ? 'border-accent bg-orange-50 text-accent-strong' : 'border-line'}`}>
              <Icon size={20} aria-hidden />{label}
            </button>
          ))}
        </div>
        <Field label="Monto del abono"><input inputMode="decimal" className={`${inputCls} num text-2xl`} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Nota (opcional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. abono semanal" /></Field>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy} onClick={run}>Registrar abono</Button>
      </div>
    </Modal>
  );
}

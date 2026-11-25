import { Banknote, CreditCard, Landmark, Minus, Plus, ReceiptText, Search, ShoppingCart, Trash2, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useApp, useLoad } from '../app-context';
import type { Ferre } from '../data/ferre';
import { mxn } from '../data/kpis';
import type { CustomerRecord, PaymentKind, TicketRecord } from '../data/types';
import { Alert, Button, Card, Empty, Field, Modal, Skeleton, inputCls, toCents } from '../ui/kit';

const loadAll = async (f: Ferre) => ({
  products: await f.listProducts(),
  customers: await f.listCustomers(),
  shift: await f.getOpenShift(),
});
type Line = { sku: string; quantity: number };

export function Pos() {
  const { ferre, session, refresh } = useApp();
  const { data, loading } = useLoad(loadAll);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<TicketRecord | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const products = data?.products ?? [];
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const total = cart.reduce((s, l) => s + Math.round((byId.get(l.sku)?.priceCents ?? 0) * l.quantity), 0);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? products.filter((p) => p.name.toLowerCase().includes(t) || p.id.toLowerCase().includes(t)).slice(0, 12) : products.slice(0, 12);
  }, [q, products]);

  const add = (sku: string) => {
    const p = byId.get(sku);
    if (!p) return;
    const inCart = cart.find((l) => l.sku === sku)?.quantity ?? 0;
    if (inCart + 1 > p.stock) { toast.error(`Solo quedan ${p.stock} de ${p.name}.`); return; }
    setCart(inCart ? cart.map((l) => (l.sku === sku ? { ...l, quantity: l.quantity + 1 } : l)) : [...cart, { sku, quantity: 1 }]);
    setQ('');
    search.current?.focus();
  };
  const change = (sku: string, delta: number) => {
    const p = byId.get(sku);
    setCart(cart.flatMap((l) => {
      if (l.sku !== sku) return [l];
      const quantity = l.quantity + delta;
      if (quantity <= 0) return [];
      if (p && quantity > p.stock) { toast.error(`Solo quedan ${p.stock}.`); return [l]; }
      return [{ ...l, quantity }];
    }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'F9' && cart.length > 0 && data?.shift) { e.preventDefault(); setPaying(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart.length, data?.shift]);

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-4">
        {!data?.shift && <Alert>La caja está cerrada. Pide a la Cajera o al Encargado que la abra en “Caja” para poder cobrar.</Alert>}
        <Card>
          <Field label="Buscar producto o clave (F2)">
            <div className="relative">
              <Search aria-hidden size={20} className="absolute left-3 top-3 text-slate-500" />
              <input ref={search} autoFocus value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} pl-10`} placeholder="Ej. martillo o MART-001"
                onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) add(matches[0].id); }} />
            </div>
          </Field>
        </Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.length === 0 && <div className="col-span-full"><Empty icon={<Search size={40} />} title="No encontramos nada" text="Revisa cómo escribiste el nombre o la clave." /></div>}
          {matches.map((p) => (
            <button key={p.id} type="button" disabled={p.stock <= 0} onClick={() => add(p.id)}
              className="rounded-card border border-line bg-white p-3 text-left hover:border-accent disabled:opacity-50">
              <span className="block font-semibold">{p.name}</span>
              <span className="flex items-baseline justify-between pt-1">
                <span className="num text-xl font-bold text-navy">{mxn(p.priceCents)}</span>
                <span className={`num text-sm ${p.stock <= p.minStock ? 'font-semibold text-danger' : 'text-muted'}`}>
                  {p.stock <= 0 ? 'Agotado' : `${p.stock} ${p.unit}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <aside aria-label="Ticket actual" className="h-fit rounded-card border border-line bg-white p-4 lg:sticky lg:top-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShoppingCart size={20} aria-hidden /> Ticket</h2>
        {cart.length === 0 ? (
          <Empty icon={<ReceiptText size={36} />} title="Ticket vacío" text="Busca un producto y tócalo para agregarlo." />
        ) : (
          <ul className="divide-y divide-line">
            {cart.map((l) => {
              const p = byId.get(l.sku);
              return (
                <li key={l.sku} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p?.name}</p>
                    <p className="num text-sm text-muted">{mxn(p?.priceCents ?? 0)} c/u</p>
                  </div>
                  <button type="button" aria-label="Quitar uno" onClick={() => change(l.sku, -1)} className="grid size-11 place-items-center rounded-md border border-line"><Minus size={18} /></button>
                  <span className="num w-8 text-center text-lg font-semibold">{l.quantity}</span>
                  <button type="button" aria-label="Agregar uno" onClick={() => change(l.sku, 1)} className="grid size-11 place-items-center rounded-md border border-line"><Plus size={18} /></button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-lg">Total</span>
          <span className="num text-3xl font-bold text-navy">{mxn(total)}</span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button disabled={cart.length === 0 || !data?.shift} onClick={() => setPaying(true)}><Banknote size={20} aria-hidden /> Cobrar (F9)</Button>
          <Button variant="ghost" aria-label="Vaciar ticket" disabled={cart.length === 0} onClick={() => setCart([])}><Trash2 size={20} /></Button>
        </div>
      </aside>

      {paying && (
        <PayModal
          total={total}
          customers={data?.customers ?? []}
          canCredit={ferre.can(session, 'sales:credit')}
          onClose={() => setPaying(false)}
          onPay={async (method, tendered, customerId) => {
            const t = await ferre.sell(session, cart, method, tendered, customerId);
            setCart([]); setPaying(false); setDone(t); refresh();
          }}
        />
      )}
      {done && (
        <Modal title="Venta lista" onClose={() => setDone(null)}>
          <p className="num text-3xl font-bold text-ok">{mxn(done.totalCents)}</p>
          {done.method === 'CASH' && <p className="num mt-2 text-2xl">Cambio: <strong>{mxn(done.changeCents)}</strong></p>}
          {done.method === 'CREDIT' && <p className="mt-2 text-lg font-semibold text-navy">Cargado a crédito de {done.customerName}</p>}
          <p className="mt-2 text-muted">Ticket {done.id}</p>
          <Button className="mt-4 w-full" onClick={() => { setDone(null); search.current?.focus(); }}>Nueva venta</Button>
        </Modal>
      )}
    </div>
  );
}

const METHODS: { id: PaymentKind; label: string; icon: typeof Banknote }[] = [
  { id: 'CASH', label: 'Efectivo', icon: Banknote },
  { id: 'DEBIT_CARD', label: 'Tarjeta', icon: CreditCard },
  { id: 'BANK_TRANSFER', label: 'Transferencia', icon: Landmark },
  { id: 'CREDIT', label: 'Crédito', icon: UserCheck },
];

function PayModal({
  total, customers, canCredit, onClose, onPay,
}: {
  total: number;
  customers: CustomerRecord[];
  canCredit: boolean;
  onClose: () => void;
  onPay: (m: PaymentKind, tendered: number, customerId?: string) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentKind>('CASH');
  const [given, setGiven] = useState('');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const visibleMethods = canCredit ? METHODS : METHODS.filter((m) => m.id !== 'CREDIT');
  const tendered = method === 'CASH' ? toCents(given) : total;
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const availCredit = selectedCustomer ? selectedCustomer.creditLimitCents - selectedCustomer.creditUsedCents : 0;
  const missingCash = method === 'CASH' && tendered < total;
  const overCredit = method === 'CREDIT' && (!selectedCustomer || total > availCredit);

  const confirm = async () => {
    setBusy(true); setError('');
    try { await onPay(method, tendered, method === 'CREDIT' ? customerId : undefined); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cobrar.'); setBusy(false); }
  };

  return (
    <Modal title="Cobrar" onClose={onClose}>
      <p className="num mb-4 text-4xl font-bold text-navy">{mxn(total)}</p>
      <div className={`mb-4 grid gap-2 ${visibleMethods.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`} role="radiogroup" aria-label="Forma de pago">
        {visibleMethods.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={method === id} onClick={() => setMethod(id)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border-2 text-sm font-semibold ${method === id ? 'border-accent bg-orange-50 text-accent-strong' : 'border-line'}`}>
            <Icon size={22} aria-hidden />{label}
          </button>
        ))}
      </div>
      {method === 'CASH' && (
        <div className="mb-4 space-y-2">
          <Field label="¿Con cuánto paga?">
            <input inputMode="decimal" value={given} onChange={(e) => setGiven(e.target.value)} className={`${inputCls} num text-2xl`} placeholder="0.00"
              onKeyDown={(e) => { if (e.key === 'Enter' && !missingCash && !busy) confirm(); }} />
          </Field>
          <div className="flex gap-2">
            {[total, 20000, 50000, 100000].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 4).map((v) => (
              <button key={v} type="button" onClick={() => setGiven(String(v / 100))} className="num min-h-11 flex-1 rounded-md border border-line text-sm font-semibold hover:bg-slate-50">{v === total ? 'Exacto' : mxn(v)}</button>
            ))}
          </div>
          <p className="num text-xl">{missingCash ? <span className="text-danger">Faltan {mxn(total - tendered)}</span> : <>Cambio: <strong className="text-ok">{mxn(tendered - total)}</strong></>}</p>
        </div>
      )}
      {method === 'CREDIT' && (
        <div className="mb-4 space-y-2">
          <Field label="Cliente">
            <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName} (disp. {mxn(c.creditLimitCents - c.creditUsedCents)})</option>
              ))}
            </select>
          </Field>
          {selectedCustomer && (
            <p className={`num text-base ${overCredit ? 'font-semibold text-danger' : 'text-muted'}`}>
              {overCredit ? `Crédito insuficiente (disponible: ${mxn(availCredit)})` : `Disponible después de esta venta: ${mxn(availCredit - total)}`}
            </p>
          )}
        </div>
      )}
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <Button className="w-full" disabled={missingCash || overCredit || busy} onClick={confirm}>Confirmar cobro</Button>
    </Modal>
  );
}

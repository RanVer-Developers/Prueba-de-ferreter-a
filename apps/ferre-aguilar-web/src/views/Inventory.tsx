import { AlertTriangle, PackagePlus, PackageSearch, SlidersHorizontal, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApp, useLoad } from '../app-context';
import type { Ferre } from '../data/ferre';
import { mxn } from '../data/kpis';
import type { ProductRecord } from '../data/types';
import { Alert, Button, Card, Empty, Field, Modal, Skeleton, inputCls, toCents } from '../ui/kit';

const loadInv = async (f: Ferre) => ({ products: await f.listProducts(), purchases: await f.listPurchases() });

export function Inventory() {
  const { ferre, session, refresh } = useApp();
  const { data, loading } = useLoad(loadInv);
  const [q, setQ] = useState('');
  const [receiving, setReceiving] = useState<ProductRecord | null>(null);
  const [adjusting, setAdjusting] = useState<ProductRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const canReceive = ferre.can(session, 'purchasing:receive');
  const canAdjust = ferre.can(session, 'inventory:adjust');
  const canCreate = ferre.can(session, 'catalog:edit_price');
  const showCost = ferre.can(session, 'reports:financial');

  if (loading || !data) return <Skeleton rows={6} />;
  const t = q.trim().toLowerCase();
  const list = data.products.filter((p) => !t || p.name.toLowerCase().includes(t) || p.id.toLowerCase().includes(t));
  const low = data.products.filter((p) => p.stock <= p.minStock);

  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-900">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
          Por surtir ({low.length}): {low.map((p) => p.name).join(', ')}
        </p>
      )}
      <Card title="Existencias" action={canCreate ? <Button variant="ghost" onClick={() => setCreating(true)}><PackagePlus size={20} aria-hidden /> Nuevo producto</Button> : undefined}>
        <input aria-label="Buscar en inventario" className={`${inputCls} mb-3`} placeholder="Buscar producto o clave" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.length === 0 ? <Empty icon={<PackageSearch size={40} />} title="Sin resultados" text="Prueba con otra palabra." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead className="text-sm text-muted"><tr><th className="py-2">Producto</th><th className="text-right">Existencia</th><th className="text-right">Precio</th>{showCost && <th className="text-right">Costo</th>}<th /></tr></thead>
              <tbody className="divide-y divide-line">
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2"><span className="font-medium">{p.name}</span><span className="block text-sm text-muted">{p.id}</span></td>
                    <td className={`num text-right text-lg font-semibold ${p.stock <= p.minStock ? 'text-danger' : ''}`}>{p.stock} <span className="text-sm font-normal text-muted">{p.unit}</span></td>
                    <td className="num text-right">{mxn(p.priceCents)}</td>
                    {showCost && <td className="num text-right text-muted">{mxn(p.costCents)}</td>}
                    <td className="space-x-1 whitespace-nowrap text-right">
                      {canReceive && <Button variant="ghost" aria-label={`Recibir compra de ${p.name}`} onClick={() => setReceiving(p)}><Truck size={18} /></Button>}
                      {canAdjust && <Button variant="ghost" aria-label={`Ajustar existencia de ${p.name}`} onClick={() => setAdjusting(p)}><SlidersHorizontal size={18} /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Compras recibidas">
        {data.purchases.length === 0 ? <p className="text-muted">Todavía no has recibido compras.</p> : (
          <ul className="divide-y divide-line">
            {data.purchases.slice(0, 10).map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <span>{p.quantity} × {p.productName}<span className="block text-sm text-muted">{p.supplier} · {p.byName} · {new Date(p.at).toLocaleDateString('es-MX')}</span></span>
                {showCost && <span className="num font-semibold">{mxn(Math.round(p.unitCostCents * p.quantity))}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {receiving && <ReceiveModal p={receiving} onClose={() => setReceiving(null)} onSubmit={async (v) => { await ferre.receivePurchase(session, { sku: receiving.id, ...v }); toast.success('Compra recibida'); setReceiving(null); refresh(); }} />}
      {adjusting && <AdjustModal p={adjusting} onClose={() => setAdjusting(null)} onSubmit={async (n, r) => { await ferre.adjustStock(session, adjusting.id, n, r); toast.success('Existencia ajustada'); setAdjusting(null); refresh(); }} />}
      {creating && <NewProductModal onClose={() => setCreating(false)} onSubmit={async (v) => { await ferre.createProduct(session, v); toast.success('Producto creado'); setCreating(false); refresh(); }} />}
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return { error, busy, run: async () => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); setBusy(false); } } };
}

function ReceiveModal({ p, onClose, onSubmit }: { p: ProductRecord; onClose: () => void; onSubmit: (v: { supplier: string; quantity: number; unitCostCents: number }) => Promise<void> }) {
  const [supplier, setSupplier] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const { error, busy, run } = useSubmit(() => onSubmit({ supplier, quantity: Number(qty), unitCostCents: toCents(cost) }));
  return (
    <Modal title={`Recibir compra: ${p.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Proveedor"><input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <Field label={`Cantidad recibida (${p.unit})`}><input inputMode="decimal" className={`${inputCls} num`} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Costo por unidad"><input inputMode="decimal" className={`${inputCls} num`} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" /></Field>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy} onClick={run}>Guardar entrada</Button>
      </div>
    </Modal>
  );
}

function AdjustModal({ p, onClose, onSubmit }: { p: ProductRecord; onClose: () => void; onSubmit: (n: number, reason: string) => Promise<void> }) {
  const [n, setN] = useState('');
  const [reason, setReason] = useState('');
  const { error, busy, run } = useSubmit(() => onSubmit(Number(n), reason));
  return (
    <Modal title={`Ajustar: ${p.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-muted">El sistema dice que hay <strong className="num">{p.stock}</strong> {p.unit}. Cuenta lo que hay en el estante.</p>
        <Field label="Cantidad contada"><input inputMode="decimal" className={`${inputCls} num text-2xl`} value={n} onChange={(e) => setN(e.target.value)} /></Field>
        <Field label="Motivo"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. conteo físico del mes" /></Field>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy || n === ''} onClick={run}>Guardar ajuste</Button>
        <p className="text-sm text-muted">Los ajustes quedan en la bitácora con tu nombre.</p>
      </div>
    </Modal>
  );
}

function NewProductModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (v: Omit<ProductRecord, 'stock'>) => Promise<void> }) {
  const [f, setF] = useState({ id: '', name: '', unit: 'pza', price: '', cost: '', min: '5' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const { error, busy, run } = useSubmit(() => onSubmit({ id: f.id.trim().toUpperCase(), name: f.name.trim(), unit: f.unit, priceCents: toCents(f.price), costCents: toCents(f.cost), minStock: Number(f.min) || 0 }));
  return (
    <Modal title="Nuevo producto" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Clave (única)"><input className={inputCls} value={f.id} onChange={set('id')} /></Field>
        <Field label="Nombre"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidad"><input className={inputCls} value={f.unit} onChange={set('unit')} /></Field>
          <Field label="Mínimo para avisar"><input inputMode="numeric" className={`${inputCls} num`} value={f.min} onChange={set('min')} /></Field>
          <Field label="Precio de venta"><input inputMode="decimal" className={`${inputCls} num`} value={f.price} onChange={set('price')} /></Field>
          <Field label="Costo"><input inputMode="decimal" className={`${inputCls} num`} value={f.cost} onChange={set('cost')} /></Field>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" disabled={busy} onClick={run}>Crear producto</Button>
        <p className="text-sm text-muted">Después usa “Recibir compra” para darle existencia.</p>
      </div>
    </Modal>
  );
}

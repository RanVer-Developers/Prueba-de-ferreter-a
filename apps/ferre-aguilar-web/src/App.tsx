import { BarChart3, LogOut, Package, ScrollText, ShoppingCart, Truck, Users, Wallet, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { ProviderShell } from './app-context';
import { createFerre, type Ferre, type Session } from './data/ferre';
import { IndexedDbStore } from './data/kv-store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Alert, Empty, Skeleton } from './ui/kit';
import { AuditLog } from './views/AuditLog';
import { Cash } from './views/Cash';
import { Customers } from './views/Customers';
import { Dashboard } from './views/Dashboard';
import { Inventory } from './views/Inventory';
import { Login, roleLabel } from './views/Login';
import { Pos } from './views/Pos';
import { SupportButton } from './views/Support';

type Tab = 'pos' | 'cash' | 'customers' | 'inventory' | 'dashboard' | 'audit';
const TABS: { id: Tab; label: string; icon: typeof ShoppingCart; permission: string; view: () => ReactNode }[] = [
  { id: 'pos', label: 'Vender', icon: ShoppingCart, permission: 'sales:create', view: () => <Pos /> },
  { id: 'cash', label: 'Caja', icon: Wallet, permission: 'cashier:open_close', view: () => <Cash /> },
  { id: 'customers', label: 'Clientes', icon: Users, permission: 'customers:read', view: () => <Customers /> },
  { id: 'inventory', label: 'Inventario', icon: Package, permission: 'inventory:read', view: () => <Inventory /> },
  { id: 'dashboard', label: 'Panel', icon: BarChart3, permission: 'reports:operational', view: () => <Dashboard /> },
  { id: 'audit', label: 'Bitácora', icon: ScrollText, permission: 'audit:read', view: () => <AuditLog /> },
];

export function App() {
  const [ferre, setFerre] = useState<Ferre | null>(null);
  const [fatal, setFatal] = useState('');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    IndexedDbStore.open().then(createFerre).then(setFerre).catch((e) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);

  if (fatal) return <div className="p-6"><Alert>No pudimos abrir los datos de este equipo: {fatal}. Revisa que el navegador permita guardar datos y recarga.</Alert></div>;
  if (!ferre) return <div className="mx-auto max-w-md p-6"><Skeleton rows={4} /></div>;
  if (!session) return <><Login ferre={ferre} onLogin={setSession} /><Toaster richColors position="top-center" /></>;
  return <Shell ferre={ferre} session={session} onLogout={() => setSession(null)} />;
}

function Shell({ ferre, session, onLogout }: { ferre: Ferre; session: Session; onLogout: () => void }) {
  const tabs = TABS.filter((t) => ferre.can(session, t.permission));
  const [tab, setTab] = useState<Tab | undefined>(tabs[0]?.id);
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const ctx = useMemo(() => ({ ferre, session, version, refresh }), [ferre, session, version, refresh]);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => { setOnline(false); toast('Sin internet: sigues trabajando normal.'); };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  return (
    <ProviderShell value={ctx}>
      <div className="flex h-full flex-col md:flex-row">
        <nav aria-label="Principal" className="order-last flex shrink-0 justify-around bg-navy-deep text-white md:order-first md:w-56 md:flex-col md:justify-start md:gap-1 md:p-3">
          <p className="hidden px-3 py-4 text-xl font-bold md:block">Ferre Aguilar</p>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-current={current?.id === id ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-sm md:min-h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-base ${current?.id === id ? 'bg-accent font-semibold text-white' : 'text-white/85 hover:bg-white/10'}`}>
              <Icon size={20} aria-hidden />{label}
            </button>
          ))}
          <div className="hidden md:mt-auto md:block"><SupportButton session={session} /></div>
        </nav>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-white px-4 py-2">
            <div>
              <p className="font-semibold">{session.name}</p>
              <p className="text-sm text-muted">{roleLabel(session.role)}</p>
            </div>
            <div className="flex items-center gap-1">
              {!online && <span className="flex items-center gap-1 text-sm text-muted"><WifiOff size={16} aria-hidden /> Sin internet</span>}
              <span className="md:hidden"><SupportButton session={session} /></span>
              <button type="button" onClick={onLogout} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-navy hover:bg-slate-100"><LogOut size={20} aria-hidden /> Salir</button>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-auto p-4">
            <ErrorBoundary onError={(e) => ferre.logError(current?.label ?? '-', 'render', e)}>
              {current ? current.view() : (
                <Empty icon={<Truck size={40} />} title="Tu pantalla viene en camino" text="Por ahora el reparto de unidades todavía no está en esta versión. Tu Encargado te dirá cómo trabajar mientras tanto." />
              )}
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <Toaster richColors position="top-center" />
    </ProviderShell>
  );
}

import { useCallback, useRef, useState } from 'react';
import {
  Boxes,
  Calculator,
  HardHat,
  Shield,
  ShoppingCart,
  Wrench,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PinPromptModal } from './components/PinPromptModal';
import { useFerreteriaApp } from './hooks/useFerreteriaApp';
import { CashierView } from './views/CashierView';
import { CounterView } from './views/CounterView';
import { InventoryPurchasingView } from './views/InventoryPurchasingView';
import { OwnerAdminView } from './views/OwnerAdminView';
import { WarehouseView } from './views/WarehouseView';

type TabId = 'COUNTER' | 'CASHIER' | 'WAREHOUSE' | 'INVENTORY' | 'OWNER';

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: typeof ShoppingCart }> = [
  { id: 'COUNTER', label: 'Mostrador', icon: ShoppingCart },
  { id: 'CASHIER', label: 'Caja', icon: Calculator },
  { id: 'WAREHOUSE', label: 'Bodega', icon: HardHat },
  { id: 'INVENTORY', label: 'Inventario', icon: Boxes },
  { id: 'OWNER', label: 'Dueño', icon: Shield },
];

export function App() {
  const { app, isLoading, initError, revision, bumpRevision } = useFerreteriaApp();
  const [activeTab, setActiveTab] = useState<TabId>('COUNTER');
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const pinResolverRef = useRef<((pin: string | null) => void) | null>(null);
  const [pinModal, setPinModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
  }>({ isOpen: false, title: '', description: '' });

  const handleNotify = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      setToast({ type, message });
      setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 5500);
    },
    []
  );

  const requestOwnerPin = useCallback((title: string, description: string) => {
    return new Promise<string | null>((resolve) => {
      pinResolverRef.current = resolve;
      setPinModal({ isOpen: true, title, description });
    });
  }, []);

  const handlePinCancel = useCallback(() => {
    setPinModal((prev) => ({ ...prev, isOpen: false }));
    pinResolverRef.current?.(null);
    pinResolverRef.current = null;
  }, []);

  const handlePinConfirm = useCallback((pin: string) => {
    setPinModal((prev) => ({ ...prev, isOpen: false }));
    pinResolverRef.current?.(pin);
    pinResolverRef.current = null;
  }, []);

  const handleCopyReport = useCallback(() => {
    if (!app) return;
    const text = app.exportTechnicalErrorReport();
    navigator.clipboard?.writeText(text).catch(() => {});
  }, [app]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
          <div className="w-10 h-10 rounded-lg bg-[#1E3A5F]/10 text-[#1E3A5F] mx-auto flex items-center justify-center">
            <Wrench className="w-5 h-5 animate-pulse" strokeWidth={1.75} />
          </div>
          <p className="font-semibold text-slate-900">Cargando El Tornillo Fuerte...</p>
          <p className="text-sm text-slate-500">Preparando inventario y caja local.</p>
        </div>
      </div>
    );
  }

  if (initError || !app) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-xl p-6 space-y-2">
          <h1 className="text-lg font-bold text-red-700">No se pudo iniciar la aplicación</h1>
          <p className="text-sm text-slate-600">{initError}</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary onCopyReport={handleCopyReport}>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row pb-20 md:pb-0">
        {/* Sidebar escritorio */}
        <aside className="hidden md:flex md:w-64 md:flex-col bg-[#1E3A5F] text-white shrink-0">
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base leading-tight truncate">
                  El Tornillo Fuerte
                </h1>
                <p className="text-xs text-slate-300">Ferretería y Materiales</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1" aria-label="Navegación principal">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-lg flex items-center gap-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-white text-[#1E3A5F] shadow-xs'
                      : 'text-slate-100 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10 text-xs text-slate-300">
            Modo Local · Guardado en dispositivo
          </div>
        </aside>

        {/* Encabezado móvil */}
        <header className="md:hidden bg-[#1E3A5F] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center">
              <Wrench className="w-4 h-4" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight">El Tornillo Fuerte</h1>
              <p className="text-[11px] text-slate-300">Modo Local</p>
            </div>
          </div>
        </header>

        {/* Contenido principal */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {toast && (
            <div
              role="status"
              aria-live="polite"
              className={`mb-5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xs ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : toast.type === 'error'
                    ? 'bg-red-50 border-red-300 text-red-900'
                    : 'bg-blue-50 border-blue-300 text-blue-900'
              }`}
            >
              {toast.message}
            </div>
          )}

          {activeTab === 'COUNTER' && (
            <CounterView
              app={app}
              revision={revision}
              onDataChanged={bumpRevision}
              onNotify={handleNotify}
              requestOwnerPin={requestOwnerPin}
            />
          )}
          {activeTab === 'CASHIER' && (
            <CashierView
              app={app}
              revision={revision}
              onDataChanged={bumpRevision}
              onNotify={handleNotify}
              requestOwnerPin={requestOwnerPin}
            />
          )}
          {activeTab === 'WAREHOUSE' && (
            <WarehouseView
              app={app}
              revision={revision}
              onDataChanged={bumpRevision}
              onNotify={handleNotify}
            />
          )}
          {activeTab === 'INVENTORY' && (
            <InventoryPurchasingView
              app={app}
              revision={revision}
              onDataChanged={bumpRevision}
              onNotify={handleNotify}
            />
          )}
          {activeTab === 'OWNER' && (
            <OwnerAdminView
              app={app}
              revision={revision}
              onDataChanged={bumpRevision}
              onNotify={handleNotify}
              requestOwnerPin={requestOwnerPin}
            />
          )}
        </main>

        {/* Barra inferior móvil */}
        <nav
          aria-label="Navegación móvil"
          className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex justify-around py-1.5 z-40"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[48px] px-2 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  isActive ? 'text-[#1E3A5F]' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <PinPromptModal
          isOpen={pinModal.isOpen}
          title={pinModal.title}
          description={pinModal.description}
          onCancel={handlePinCancel}
          onConfirm={handlePinConfirm}
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;

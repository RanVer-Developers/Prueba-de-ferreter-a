import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-slate-300',
  secondary: 'bg-navy text-white hover:bg-navy-deep disabled:bg-slate-300',
  danger: 'bg-danger text-white hover:bg-red-700 disabled:bg-slate-300',
  ghost: 'bg-white text-ink border border-line hover:bg-slate-50 disabled:text-slate-400',
};

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-ink placeholder:text-slate-400';

export function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
      <div aria-hidden className="text-slate-400">{icon}</div>
      <p className="text-lg font-semibold text-ink">{title}</p>
      <p>{text}</p>
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-10 w-full" />)}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input,button,select')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={ref} className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-card bg-white p-5 sm:rounded-card">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="grid size-11 place-items-center rounded-md hover:bg-slate-100"><X size={20} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
      <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />{children}
    </p>
  );
}

export const toCents = (v: string): number => Math.round(Number.parseFloat(v.replace(',', '.')) * 100) || 0;

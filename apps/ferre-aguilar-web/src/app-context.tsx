import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Ferre, Session } from './data/ferre';

interface Ctx {
  ferre: Ferre;
  session: Session;
  /** bumps after each mutation so views reload their data */
  version: number;
  refresh: () => void;
}
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
};

export function useLoad<T>(loader: (f: Ferre) => Promise<T>): { data: T | null; loading: boolean } {
  const { ferre, version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(loader, [loader]);
  useEffect(() => {
    let live = true;
    load(ferre).then((d) => { if (live) { setData(d); setLoading(false); } });
    return () => { live = false; };
  }, [ferre, version, load]);
  return { data, loading };
}

export function ProviderShell({ value, children }: { value: Ctx; children: ReactNode }) {
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

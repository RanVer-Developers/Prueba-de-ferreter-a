import { Delete, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Ferre, Session } from '../data/ferre';
import type { StaffRecord } from '../data/types';
import { Alert, Skeleton } from '../ui/kit';

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Dueño', MANAGER: 'Encargado', CASHIER: 'Cajera', SELLER: 'Vendedor', WAREHOUSE: 'Bodeguero', DRIVER: 'Chofer',
};
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;

export function Login({ ferre, onLogin }: { ferre: Ferre; onLogin: (s: Session) => void }) {
  const [staff, setStaff] = useState<StaffRecord[] | null>(null);
  const [who, setWho] = useState<StaffRecord | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { ferre.listStaff().then(setStaff); }, [ferre]);

  const submit = async (value: string) => {
    if (!who) return;
    try {
      const s = await ferre.login(who.id, value);
      toast.success(`Hola, ${s.name}`);
      onLogin(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos entrar.');
      setPin('');
    }
  };
  const press = (d: string) => {
    if (pin.length >= 6) return;
    setError('');
    setPin(pin + d);
  };

  return (
    <main className="grid min-h-full place-items-center bg-navy-deep p-4">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl">
        <h1 className="text-3xl font-bold text-navy">Ferre Aguilar</h1>
        <p className="mb-5 text-muted">{who ? `Hola ${who.displayName}, escribe tu PIN` : '¿Quién eres?'}</p>
        {!staff && <Skeleton rows={3} />}
        {!who && staff && (
          <div className="grid grid-cols-2 gap-3">
            {staff.map((s) => (
              <button key={s.id} type="button" onClick={() => setWho(s)}
                className="min-h-20 rounded-md border border-line p-3 text-left hover:border-accent hover:bg-orange-50">
                <span className="block text-lg font-semibold">{s.displayName}</span>
                <span className="text-sm text-muted">{roleLabel(s.roleCode)}</span>
              </button>
            ))}
          </div>
        )}
        {who && (
          <div className="space-y-4">
            <div aria-label="PIN" className="flex h-14 items-center justify-center gap-3 rounded-md bg-slate-100 text-3xl tracking-widest">
              {pin ? '•'.repeat(pin.length) : <span className="text-base text-slate-500">PIN de 4 a 6 números</span>}
            </div>
            {error && <Alert>{error}</Alert>}
            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9'].map((d) => (
                <button key={d} type="button" onClick={() => press(d)} className="num min-h-14 rounded-md border border-line text-2xl font-semibold hover:bg-slate-50">{d}</button>
              ))}
              <button type="button" aria-label="Borrar" onClick={() => setPin(pin.slice(0, -1))} className="grid min-h-14 place-items-center rounded-md border border-line hover:bg-slate-50"><Delete /></button>
              <button type="button" onClick={() => press('0')} className="num min-h-14 rounded-md border border-line text-2xl font-semibold hover:bg-slate-50">0</button>
              <button type="button" aria-label="Entrar" disabled={pin.length < 4} onClick={() => submit(pin)}
                className="grid min-h-14 place-items-center rounded-md bg-accent text-white hover:bg-accent-strong disabled:bg-slate-300"><LogIn /></button>
            </div>
            <button type="button" className="min-h-11 text-navy underline" onClick={() => { setWho(null); setPin(''); setError(''); }}>No soy yo</button>
          </div>
        )}
      </div>
    </main>
  );
}

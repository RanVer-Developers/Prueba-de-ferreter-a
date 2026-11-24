import { useState, type FormEvent } from "react";
import { Delete, KeyRound, ShieldCheck, Wrench } from "lucide-react";
import { ROLE_LABELS, type FerreUser } from "../core/ferre-types.js";

interface PinLoginScreenProps {
  users: FerreUser[];
  onLogin: (user: FerreUser) => void;
}

export function PinLoginScreen({ users, onLogin }: PinLoginScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const match = users.find((u) => u.pin === pin.trim());
    if (!match) {
      setError("PIN incorrecto. Verifique e intente de nuevo.");
      setPin("");
      return;
    }
    if (!match.active) {
      setError("Este usuario está desactivado. Consulte al Dueño.");
      setPin("");
      return;
    }
    setError("");
    onLogin(match);
  };

  const appendDigit = (digit: string) => {
    if (pin.length >= 6) return;
    setError("");
    setPin((prev) => prev + digit);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
              <Wrench className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Ferre Alfredo
              </h1>
              <p className="text-sm text-slate-600">
                Control de Mostrador, Caja e Inventario
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="pin-input"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Ingrese su PIN de acceso
              </label>
              <input
                id="pin-input"
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => {
                  setError("");
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                }}
                placeholder="••••"
                className="w-full h-12 px-4 rounded-lg border border-slate-300 bg-white text-slate-900 text-xl tracking-[0.4em] text-center font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {error}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => appendDigit(d)}
                  className="min-h-12 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-lg font-semibold text-slate-900 active:scale-[0.98] transition tabular-nums"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin("")}
                className="min-h-12 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 active:scale-[0.98] transition"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => appendDigit("0")}
                className="min-h-12 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-lg font-semibold text-slate-900 active:scale-[0.98] transition tabular-nums"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Borrar último dígito"
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="min-h-12 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 active:scale-[0.98] transition"
              >
                <Delete className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <button
              type="submit"
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-3 active:scale-[0.98] transition"
            >
              <KeyRound className="w-5 h-5" strokeWidth={1.75} />
              Entrar al sistema
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-slate-900 font-semibold mb-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
            <h2>Acceso rápido por puesto (Prueba)</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            Seleccione cualquier puesto para comprobar cómo cambian los permisos
            y candados anti-robo en tiempo real:
          </p>
          <div className="space-y-2">
            {users
              .filter((u) => u.active)
              .map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => onLogin(u)}
                  className="w-full min-h-11 px-3.5 py-2.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 flex items-center justify-between text-left active:scale-[0.99] transition"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {u.name}
                    </p>
                    <p className="text-xs text-slate-600">
                      Puesto: {ROLE_LABELS[u.role]}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded border border-slate-200 tabular-nums">
                    PIN {u.pin}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

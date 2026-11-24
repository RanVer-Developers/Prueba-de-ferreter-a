import { useState, type FormEvent } from "react";
import { Copy, LifeBuoy, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@modulos/core-shared";
import { buildTechnicalReport } from "../core/error-log.js";
import { ROLE_PERMISSIONS } from "../core/ferre-store.js";
import {
  ROLE_LABELS,
  type FerreUser,
  type UserRole,
} from "../core/ferre-types.js";

interface UsersSupportModalProps {
  mode: "users" | "support";
  users: FerreUser[];
  canManageUsers: boolean;
  onClose: () => void;
  onAddUser: (user: FerreUser) => void;
  onToggleUser: (userId: string) => void;
}

export function UsersSupportModal({
  mode,
  users,
  canManageUsers,
  onClose,
  onAddUser,
  onToggleUser,
}: UsersSupportModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("seller");
  const [pin, setPin] = useState("");

  const handleCopyReport = async () => {
    const report = buildTechnicalReport();
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Reporte técnico copiado. Péguelo en WhatsApp para soporte.");
    } catch {
      toast.info("Reporte listo en pantalla para copiar manualmente.");
    }
  };

  const handleCreateUser = (e: FormEvent) => {
    e.preventDefault();
    if (!canManageUsers) return;
    if (name.trim().length < 2) {
      toast.error("Escriba el nombre del empleado.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error("El PIN debe tener entre 4 y 6 números.");
      return;
    }
    if (users.some((u) => u.pin === pin)) {
      toast.error("Ese PIN ya lo usa otro empleado. Elija uno distinto.");
      return;
    }

    onAddUser({
      id: generateId(),
      name: name.trim(),
      role,
      pin,
      active: true,
      permissions: { ...ROLE_PERMISSIONS[role] },
    });
    setName("");
    setPin("");
    toast.success("Usuario registrado correctamente.");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "users" ? "Gestión de usuarios" : "Ayuda y soporte"}
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {mode === "users" ? (
              <Users className="w-5 h-5 text-slate-900" strokeWidth={1.75} />
            ) : (
              <LifeBuoy className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
            )}
            <h2 className="text-lg font-semibold text-slate-900">
              {mode === "users" ? "Usuarios y Permisos" : "Ayuda y Soporte Técnico"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            className="min-w-10 min-h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {mode === "support" ? (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-900">
                  Atajos rápidos de teclado en Mostrador
                </p>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>
                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono">
                      F2
                    </kbd>{" "}
                    Ir directo al buscador de productos / código de barras
                  </li>
                  <li>
                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono">
                      Enter
                    </kbd>{" "}
                    Agregar producto cuando coincide código o SKU exacto
                  </li>
                  <li>
                    <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs font-mono">
                      F9
                    </kbd>{" "}
                    Abrir ventana de cobro rápido
                  </li>
                </ul>
              </div>

              <div>
                <p className="text-sm text-slate-700 mb-3 leading-relaxed">
                  Si ocurre algún fallo o comportamiento extraño, presione este
                  botón y envíe el texto copiado por WhatsApp a soporte:
                </p>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2.5 active:scale-[0.98] transition"
                >
                  <Copy className="w-4 h-4" strokeWidth={1.75} />
                  Copiar reporte técnico
                </button>
              </div>
            </>
          ) : (
            <>
              {canManageUsers && (
                <form
                  onSubmit={handleCreateUser}
                  className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    Agregar nuevo empleado
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="new-user-name"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Nombre
                      </label>
                      <input
                        id="new-user-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ej. Rosa"
                        className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="new-user-role"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Puesto
                      </label>
                      <select
                        id="new-user-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                      >
                        {Object.entries(ROLE_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="new-user-pin"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        PIN (4-6 dígitos)
                      </label>
                      <input
                        id="new-user-pin"
                        type="text"
                        inputMode="numeric"
                        value={pin}
                        onChange={(e) =>
                          setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="7777"
                        className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm tabular-nums"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 active:scale-[0.98] transition"
                  >
                    <UserPlus className="w-4 h-4" strokeWidth={1.75} />
                    Crear usuario
                  </button>
                </form>
              )}

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {u.name}
                      </p>
                      <p className="text-xs text-slate-600">
                        {ROLE_LABELS[u.role]} • PIN {u.pin}
                      </p>
                    </div>
                    {canManageUsers && u.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => onToggleUser(u.id)}
                        className={`min-h-10 px-3 rounded-lg text-xs font-semibold border transition ${
                          u.active
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                        }`}
                      >
                        {u.active ? "Activo" : "Desactivado"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

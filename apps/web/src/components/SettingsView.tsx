import { useState, type FormEvent } from "react";
import {
  Download,
  Edit3,
  Package,
  Save,
  Shield,
  Sliders,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@modulos/core-shared";
import {
  ROLE_PERMISSIONS,
  formatMXN,
  pesosToCents,
} from "../core/ferre-store.js";
import {
  PERMISSION_LABELS,
  ROLE_LABELS,
  type BusinessSettings,
  type FerreState,
  type FerreUser,
  type UserPermissions,
  type UserRole,
} from "../core/ferre-types.js";

interface SettingsViewProps {
  currentUser: FerreUser;
  state: FerreState;
  onUpdateSettings: (next: BusinessSettings) => void;
  onSaveUser: (user: FerreUser, isNew: boolean) => void;
  onImportBackup: (nextState: FerreState) => void;
}

export function SettingsView({
  currentUser,
  state,
  onUpdateSettings,
  onSaveUser,
  onImportBackup,
}: SettingsViewProps) {
  const [section, setSection] = useState<
    "users" | "inventory" | "security" | "backup"
  >("users");

  // Formulario de configuración
  const [settingsForm, setSettingsForm] = useState<BusinessSettings>(
    state.settings
  );
  const [tolerancePesos, setTolerancePesos] = useState(
    String((state.settings.cashDiscrepancyToleranceCents / 100).toFixed(2))
  );
  const [maxDrawerPesos, setMaxDrawerPesos] = useState(
    String((state.settings.maxDrawerCashCents / 100).toFixed(2))
  );

  // Editor de usuario y permisos
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("seller");
  const [userPin, setUserPin] = useState("");
  const [userActive, setUserActive] = useState(true);
  const [userPerms, setUserPerms] = useState<UserPermissions>({
    ...ROLE_PERMISSIONS.seller,
  });

  const startNewUser = () => {
    setEditingUserId("new");
    setUserName("");
    setUserRole("seller");
    setUserPin("");
    setUserActive(true);
    setUserPerms({ ...ROLE_PERMISSIONS.seller });
  };

  const startEditUser = (u: FerreUser) => {
    setEditingUserId(u.id);
    setUserName(u.name);
    setUserRole(u.role);
    setUserPin(u.pin);
    setUserActive(u.active);
    setUserPerms({ ...u.permissions });
  };

  const handleSaveUser = (e: FormEvent) => {
    e.preventDefault();
    if (userName.trim().length < 2) {
      toast.error("Escriba el nombre del empleado.");
      return;
    }
    if (!/^\d{4,6}$/.test(userPin)) {
      toast.error("El PIN debe tener entre 4 y 6 dígitos numéricos.");
      return;
    }
    const duplicatePin = state.users.some(
      (u) => u.pin === userPin && u.id !== editingUserId
    );
    if (duplicatePin) {
      toast.error("Ese PIN ya pertenece a otro usuario.");
      return;
    }

    const isNew = editingUserId === "new";
    onSaveUser(
      {
        id: isNew ? generateId() : (editingUserId as string),
        name: userName.trim(),
        role: userRole,
        pin: userPin,
        active: userActive,
        permissions: userPerms,
      },
      isNew
    );
    setEditingUserId(null);
    toast.success(isNew ? "Usuario creado." : "Usuario y permisos actualizados.");
  };

  const handleSaveSettings = (e: FormEvent) => {
    e.preventDefault();
    const tolCents = pesosToCents(Number(tolerancePesos));
    const maxCents = pesosToCents(Number(maxDrawerPesos));
    if (tolCents < 0 || maxCents < 0) {
      toast.error("Los montos en pesos no pueden ser negativos.");
      return;
    }
    onUpdateSettings({
      ...settingsForm,
      cashDiscrepancyToleranceCents: tolCents,
      maxDrawerCashCents: maxCents,
    });
    toast.success("Configuración del negocio guardada.");
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respaldo-ferre-alfredo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Respaldo descargado en su equipo.");
  };

  const handleRestoreJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as FerreState;
        if (!parsed || parsed.schemaVersion !== 2 || !Array.isArray(parsed.users)) {
          toast.error("El archivo no es un respaldo válido de Ferre Alfredo.");
          return;
        }
        onImportBackup(parsed);
        toast.success("Respaldo restaurado correctamente.");
      } catch {
        toast.error("No se pudo leer el archivo de respaldo.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Configuración y Control del Negocio
          </h1>
          <p className="text-sm text-slate-600">
            Administre usuarios, permisos granulares, método de inventario y
            candados de caja.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          {(
            [
              ["users", "Usuarios y Permisos", Users],
              ["inventory", "Inventario y Costeo", Package],
              ["security", "Caja y Anti-Robo", Shield],
              ["backup", "Respaldos", Download],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`min-h-10 px-3.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                section === id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-700 hover:bg-white"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. USUARIOS Y PERMISOS */}
      {section === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-sm font-semibold text-slate-900">
                Equipo ({state.users.length})
              </h2>
              <button
                type="button"
                onClick={startNewUser}
                className="min-h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                Nuevo empleado
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {state.users.map((u) => (
                <div
                  key={u.id}
                  className="px-4 py-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {u.name}
                      {!u.active && (
                        <span className="ml-2 text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                          Inactivo
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-600">
                      {ROLE_LABELS[u.role]} • PIN {u.pin}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEditUser(u)}
                    className="min-h-9 px-3 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            {!editingUserId ? (
              <div className="py-12 text-center text-slate-600 text-sm">
                Seleccione <strong>Editar</strong> en un empleado o{" "}
                <strong>Nuevo empleado</strong> para personalizar su puesto,
                PIN y permisos exactos.
              </div>
            ) : (
              <form onSubmit={handleSaveUser} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    {editingUserId === "new"
                      ? "Nuevo empleado"
                      : `Editando: ${userName}`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingUserId(null)}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="edit-user-name"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Nombre
                    </label>
                    <input
                      id="edit-user-name"
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-user-role"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Puesto base
                    </label>
                    <select
                      id="edit-user-role"
                      value={userRole}
                      onChange={(e) => {
                        const r = e.target.value as UserRole;
                        setUserRole(r);
                        setUserPerms({ ...ROLE_PERMISSIONS[r] });
                      }}
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                    >
                      {Object.entries(ROLE_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>
                          {lbl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="edit-user-pin"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      PIN (4-6 dígitos)
                    </label>
                    <input
                      id="edit-user-pin"
                      type="text"
                      inputMode="numeric"
                      value={userPin}
                      onChange={(e) =>
                        setUserPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                    />
                  </div>
                </div>

                {editingUserId !== currentUser.id && (
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userActive}
                      onChange={(e) => setUserActive(e.target.checked)}
                      className="w-4 h-4 accent-slate-900"
                    />
                    Usuario activo (puede iniciar sesión)
                  </label>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Permisos individuales de esta persona
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(
                      Object.keys(PERMISSION_LABELS) as Array<
                        keyof UserPermissions
                      >
                    ).map((permKey) => (
                      <label
                        key={permKey}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={userPerms[permKey]}
                          onChange={(e) =>
                            setUserPerms((prev) => ({
                              ...prev,
                              [permKey]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-slate-900 shrink-0"
                        />
                        <span>{PERMISSION_LABELS[permKey]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="min-h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" strokeWidth={1.75} />
                  Guardar cambios
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 2. INVENTARIO Y COSTEO (FIFO vs CMP) */}
      {section === "inventory" && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl shadow-sm space-y-5"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-slate-800" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-slate-900">
              Reglas de Inventario y Valuación
            </h2>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">
              Método de costeo de inventario
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  settingsForm.inventoryValuation === "CMP"
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                  <input
                    type="radio"
                    name="valuation"
                    checked={settingsForm.inventoryValuation === "CMP"}
                    onChange={() =>
                      setSettingsForm((s) => ({
                        ...s,
                        inventoryValuation: "CMP",
                      }))
                    }
                    className="accent-slate-900"
                  />
                  Costo Promedio (CMP)
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Recalcula el costo promedio ponderado cada vez que recibe
                  mercancía de proveedor. Ideal para ferretería general.
                </p>
              </label>

              <label
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  settingsForm.inventoryValuation === "FIFO"
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                  <input
                    type="radio"
                    name="valuation"
                    checked={settingsForm.inventoryValuation === "FIFO"}
                    onChange={() =>
                      setSettingsForm((s) => ({
                        ...s,
                        inventoryValuation: "FIFO",
                      }))
                    }
                    className="accent-slate-900"
                  />
                  PEPS / FIFO
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Primeras Entradas, Primeras Salidas. Controla el costo por
                  capas de compra según orden de llegada.
                </p>
              </label>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settingsForm.allowNegativeStock}
              onChange={(e) =>
                setSettingsForm((s) => ({
                  ...s,
                  allowNegativeStock: e.target.checked,
                }))
              }
              className="w-4 h-4 mt-0.5 accent-slate-900"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Permitir vender aunque el sistema marque 0 en existencia
              </p>
              <p className="text-xs text-slate-600">
                Si está desactivado, el mostrador bloquea la venta cuando no hay
                stock suficiente para evitar ventas fantasma.
              </p>
            </div>
          </label>

          <button
            type="submit"
            className="min-h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" strokeWidth={1.75} />
            Guardar reglas de inventario
          </button>
        </form>
      )}

      {/* 3. CAJA Y SEGURIDAD ANTI-ROBO */}
      {section === "security" && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Candados de Caja y Prevención de Robos
          </h2>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settingsForm.blindCashCount}
              onChange={(e) =>
                setSettingsForm((s) => ({
                  ...s,
                  blindCashCount: e.target.checked,
                }))
              }
              className="w-4 h-4 mt-0.5 accent-slate-900"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Activar Arqueo Ciego en corte de caja
              </p>
              <p className="text-xs text-slate-600">
                La cajera no verá cuánto dinero debería haber en el cajón hasta
                que ingrese su conteo físico y cierre el turno.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={settingsForm.requireSupervisorPinForCancel}
              onChange={(e) =>
                setSettingsForm((s) => ({
                  ...s,
                  requireSupervisorPinForCancel: e.target.checked,
                }))
              }
              className="w-4 h-4 mt-0.5 accent-slate-900"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Exigir PIN de supervisor para cancelar ventas
              </p>
              <p className="text-xs text-slate-600">
                Nadie sin permiso de cancelación puede anular un ticket sin
                autorización presencial del Dueño o Encargado.
              </p>
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="tolerance-pesos"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Tolerancia de descuadre en corte ($)
              </label>
              <input
                id="tolerance-pesos"
                type="number"
                min="0"
                step="0.50"
                value={tolerancePesos}
                onChange={(e) => setTolerancePesos(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
              <p className="text-xs text-slate-500 mt-1">
                Actual: {formatMXN(state.settings.cashDiscrepancyToleranceCents)}
              </p>
            </div>
            <div>
              <label
                htmlFor="max-drawer-pesos"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Alerta de efectivo máximo en cajón ($)
              </label>
              <input
                id="max-drawer-pesos"
                type="number"
                min="0"
                step="50"
                value={maxDrawerPesos}
                onChange={(e) => setMaxDrawerPesos(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
              <p className="text-xs text-slate-500 mt-1">
                Avisa cuando conviene hacer retiro parcial.
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="min-h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Save className="w-4 h-4" strokeWidth={1.75} />
            Guardar seguridad de caja
          </button>
        </form>
      )}

      {/* 4. RESPALDO Y RESTAURACIÓN */}
      {section === "backup" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl shadow-sm space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">
              Respaldo Local de Información
            </h2>
            <p className="text-sm text-slate-600">
              Descargue una copia completa de productos, ventas, cortes,
              usuarios y bitácora antes de cambiar de equipo (en Versión 2 se
              sincronizará automáticamente con Firebase).
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportJson}
              className="min-h-11 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" strokeWidth={1.75} />
              Descargar respaldo (.json)
            </button>

            <label className="min-h-11 px-4 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
              Restaurar desde respaldo
              <input
                type="file"
                accept="application/json"
                onChange={handleRestoreJson}
                className="sr-only"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

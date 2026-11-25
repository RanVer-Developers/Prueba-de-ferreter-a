import { useState, type FormEvent } from "react";
import {
  Banknote,
  Edit3,
  Lock,
  Plus,
  Unlock,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { generateId } from "@modulos/core-shared";
import { formatMXN, pesosToCents, subtractCents } from "../core/ferre-store.js";
import type { FerreCustomer, FerreUser } from "../core/ferre-types.js";

interface CustomersViewProps {
  currentUser: FerreUser;
  customers: FerreCustomer[];
  onSaveCustomer: (customer: FerreCustomer, isNew: boolean) => void;
  onRecordPayment: (
    customerId: string,
    amountCents: number,
    reference: string
  ) => void;
  onToggleFreeze: (customerId: string) => void;
}

export function CustomersView({
  currentUser,
  customers,
  onSaveCustomer,
  onRecordPayment,
  onToggleFreeze,
}: CustomersViewProps) {
  const perms = currentUser.permissions;

  const [editingCustomer, setEditingCustomer] = useState<FerreCustomer | null>(
    null
  );
  const [isNew, setIsNew] = useState(false);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cCreditEnabled, setCCreditEnabled] = useState(false);
  const [cLimitPesos, setCLimitPesos] = useState("5000");
  const [cTermDays, setCTermDays] = useState("15");

  const [payingCustomer, setPayingCustomer] = useState<FerreCustomer | null>(
    null
  );
  const [payPesos, setPayPesos] = useState("");
  const [payRef, setPayRef] = useState("Abono en efectivo");

  const totalReceivableCents = customers.reduce(
    (acc, c) => acc + c.creditBalanceCents,
    0
  );

  const openModal = (cust?: FerreCustomer) => {
    if (cust) {
      setIsNew(false);
      setEditingCustomer(cust);
      setCName(cust.name);
      setCPhone(cust.phone);
      setCCreditEnabled(cust.creditEnabled);
      setCLimitPesos((cust.creditLimitCents / 100).toFixed(2));
      setCTermDays(String(cust.creditTermDays));
    } else {
      setIsNew(true);
      setEditingCustomer({
        id: generateId(),
        name: "",
        phone: "",
        creditEnabled: true,
        creditLimitCents: 500000,
        creditTermDays: 15,
        creditBalanceCents: 0,
        creditFrozen: false,
        ledger: [],
      });
      setCName("");
      setCPhone("");
      setCCreditEnabled(true);
      setCLimitPesos("5000.00");
      setCTermDays("15");
    }
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (cName.trim().length < 2) {
      toast.error("El nombre del cliente es obligatorio.");
      return;
    }
    const limitCents = cCreditEnabled
      ? pesosToCents(Number(cLimitPesos) || 0)
      : 0;
    const termDays = cCreditEnabled ? Math.max(1, Number(cTermDays) || 15) : 0;

    onSaveCustomer(
      {
        ...editingCustomer,
        name: cName.trim(),
        phone: cPhone.trim(),
        creditEnabled: cCreditEnabled,
        creditLimitCents: limitCents,
        creditTermDays: termDays,
      },
      isNew
    );
    setEditingCustomer(null);
  };

  const handlePaySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!payingCustomer) return;
    const cents = pesosToCents(Number(payPesos));
    if (cents <= 0) {
      toast.error("Ingrese un monto mayor a cero.");
      return;
    }
    if (cents > payingCustomer.creditBalanceCents) {
      toast.error("El abono no puede superar el adeudo actual.");
      return;
    }
    onRecordPayment(
      payingCustomer.id,
      cents,
      payRef.trim() || "Abono en efectivo"
    );
    setPayingCustomer(null);
    setPayPesos("");
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Clientes y Cuentas por Cobrar
          </h1>
          <p className="text-sm text-slate-600">
            Total por cobrar en créditos:{" "}
            <strong className="text-amber-700 tabular-nums">
              {formatMXN(totalReceivableCents)}
            </strong>
          </p>
        </div>

        {(perms.canManageCredit || perms.canSell) && (
          <button
            type="button"
            onClick={() => openModal()}
            className="min-h-11 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            Nuevo cliente
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers
          .filter((c) => c.id !== "cust-general")
          .map((c) => {
            const available = Math.max(
              0,
              subtractCents(c.creditLimitCents, c.creditBalanceCents)
            );
            return (
              <div
                key={c.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {c.name}
                      </h2>
                      <p className="text-xs text-slate-600">
                        {c.phone || "Sin teléfono"}
                      </p>
                    </div>
                    {c.creditEnabled ? (
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          c.creditFrozen
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {c.creditFrozen ? "Congelado" : "Crédito activo"}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        Solo contado
                      </span>
                    )}
                  </div>

                  {c.creditEnabled && (
                    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Adeudo actual:</span>
                        <span
                          className={`font-bold tabular-nums ${
                            c.creditBalanceCents > 0
                              ? "text-amber-700"
                              : "text-slate-900"
                          }`}
                        >
                          {formatMXN(c.creditBalanceCents)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Disponible:</span>
                        <span className="font-semibold text-emerald-700 tabular-nums">
                          {formatMXN(available)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-slate-200">
                        <span>Límite: {formatMXN(c.creditLimitCents)}</span>
                        <span>Plazo: {c.creditTermDays} días</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  {c.creditBalanceCents > 0 && perms.canCollect && (
                    <button
                      type="button"
                      onClick={() => {
                        setPayingCustomer(c);
                        setPayPesos((c.creditBalanceCents / 100).toFixed(2));
                      }}
                      className="flex-1 min-h-10 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <Banknote className="w-4 h-4" strokeWidth={1.75} />
                      Registrar abono
                    </button>
                  )}

                  {perms.canManageCredit && (
                    <>
                      <button
                        type="button"
                        onClick={() => openModal(c)}
                        className="min-h-10 px-3 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Editar
                      </button>
                      {c.creditEnabled && (
                        <button
                          type="button"
                          onClick={() => onToggleFreeze(c.id)}
                          className="min-h-10 px-3 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                        >
                          {c.creditFrozen ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" strokeWidth={1.75} />
                              Activar
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" strokeWidth={1.75} />
                              Congelar
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Modal Alta/Edición Cliente */}
      {editingCustomer && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={isNew ? "Nuevo cliente" : "Editar cliente"}
        >
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-slate-800" strokeWidth={1.75} />
                <h3 className="text-lg font-semibold text-slate-900">
                  {isNew ? "Nuevo cliente" : "Editar cliente"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="min-w-10 min-h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre o Razón Social *
                </label>
                <input
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Ej. Ferretería y Obras del Sur"
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Teléfono / WhatsApp
                </label>
                <input
                  type="text"
                  value={cPhone}
                  onChange={(e) => setCPhone(e.target.value)}
                  placeholder="55-0000-0000"
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              {perms.canManageCredit && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cCreditEnabled}
                      onChange={(e) => setCCreditEnabled(e.target.checked)}
                      className="w-4 h-4 accent-slate-900"
                    />
                    Autorizar ventas a crédito
                  </label>

                  {cCreditEnabled && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Límite de crédito ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={cLimitPesos}
                          onChange={(e) => setCLimitPesos(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Plazo (días)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={cTermDays}
                          onChange={(e) => setCTermDays(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="min-h-11 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 px-5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                >
                  Guardar cliente
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal Registrar Abono */}
      {payingCustomer && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Registrar abono"
        >
          <form
            onSubmit={handlePaySubmit}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Registrar abono — {payingCustomer.name}
            </h3>
            <p className="text-sm text-slate-600">
              Adeudo actual:{" "}
              <strong className="text-amber-700 tabular-nums">
                {formatMXN(payingCustomer.creditBalanceCents)}
              </strong>
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Monto del abono ($)
              </label>
              <input
                type="number"
                min="0.50"
                step="0.50"
                autoFocus
                value={payPesos}
                onChange={(e) => setPayPesos(e.target.value)}
                className="w-full h-12 px-3 rounded-lg border border-slate-300 text-lg font-bold text-right tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Concepto / Referencia
              </label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingCustomer(null)}
                className="min-h-11 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-11 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                Confirmar abono
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

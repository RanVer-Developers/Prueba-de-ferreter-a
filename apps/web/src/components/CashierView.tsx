import { useState, type FormEvent } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  Calculator,
  Lock,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  computeShiftExpectedCash,
  formatMXN,
  pesosToCents,
} from "../core/ferre-store.js";
import type {
  BusinessSettings,
  CashShift,
  FerreSale,
  FerreUser,
} from "../core/ferre-types.js";

interface CashierViewProps {
  currentUser: FerreUser;
  users: FerreUser[];
  settings: BusinessSettings;
  openShift: CashShift | undefined;
  shifts: CashShift[];
  sales: FerreSale[];
  onOpenShift: (openingFloatCents: number) => void;
  onAddMovement: (
    type: "deposit" | "withdrawal",
    amountCents: number,
    reason: string
  ) => void;
  onCloseShift: (countedCashCents: number) => void;
  onCancelSale: (saleId: string, reason: string, supervisor: FerreUser) => void;
}

export function CashierView({
  currentUser,
  users,
  settings,
  openShift,
  shifts,
  sales,
  onOpenShift,
  onAddMovement,
  onCloseShift,
  onCancelSale,
}: CashierViewProps) {
  const perms = currentUser.permissions;
  const [floatPesos, setFloatPesos] = useState("1000");
  const [movType, setMovType] = useState<"deposit" | "withdrawal">("withdrawal");
  const [movAmountPesos, setMovAmountPesos] = useState("");
  const [movReason, setMovReason] = useState("");
  const [countedPesos, setCountedPesos] = useState("");

  const [cancelSaleId, setCancelSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [supervisorPin, setSupervisorPin] = useState("");

  const expectedCashCents = openShift
    ? computeShiftExpectedCash(openShift, sales)
    : 0;

  const shiftSales = openShift
    ? sales.filter((s) => s.shiftId === openShift.id)
    : [];

  const handleOpen = (e: FormEvent) => {
    e.preventDefault();
    if (!perms.canOpenCloseShift) {
      toast.error("No tiene permiso para abrir caja.");
      return;
    }
    const cents = pesosToCents(Number(floatPesos));
    if (cents < 0) {
      toast.error("Ingrese un fondo inicial válido.");
      return;
    }
    onOpenShift(cents);
    toast.success("Caja abierta correctamente.");
  };

  const handleMovement = (e: FormEvent) => {
    e.preventDefault();
    if (!perms.canCashMovement) {
      toast.error("No tiene permiso para movimientos de efectivo.");
      return;
    }
    const cents = pesosToCents(Number(movAmountPesos));
    if (cents <= 0) {
      toast.error("Indique un monto mayor a cero.");
      return;
    }
    if (movReason.trim().length < 3) {
      toast.error("Escriba el motivo del movimiento.");
      return;
    }
    onAddMovement(movType, cents, movReason.trim());
    setMovAmountPesos("");
    setMovReason("");
    toast.success("Movimiento registrado en caja.");
  };

  const handleClose = (e: FormEvent) => {
    e.preventDefault();
    if (!perms.canOpenCloseShift) {
      toast.error("No tiene permiso para cerrar caja.");
      return;
    }
    if (countedPesos.trim() === "") {
      toast.error("Cuente el efectivo en cajón e ingrese el monto.");
      return;
    }
    const cents = pesosToCents(Number(countedPesos));
    if (cents < 0) {
      toast.error("Monto contado inválido.");
      return;
    }
    onCloseShift(cents);
    setCountedPesos("");
  };

  const handleConfirmCancel = (e: FormEvent) => {
    e.preventDefault();
    if (!cancelSaleId) return;
    if (cancelReason.trim().length < 5) {
      toast.error("Indique el motivo de la cancelación (mínimo 5 letras).");
      return;
    }

    let authorizer: FerreUser | undefined;
    if (perms.canCancelSale) {
      authorizer = currentUser;
    } else {
      authorizer = users.find(
        (u) =>
          u.active &&
          u.id !== currentUser.id &&
          (u.role === "owner" || u.role === "manager") &&
          u.pin === supervisorPin.trim()
      );
    }

    if (!authorizer) {
      toast.error(
        "Se requiere PIN de Dueño o Encargado para cancelar una venta."
      );
      return;
    }

    onCancelSale(cancelSaleId, cancelReason.trim(), authorizer);
    setCancelSaleId(null);
    setCancelReason("");
    setSupervisorPin("");
  };

  return (
    <div className="space-y-6">
      {!openShift ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-lg shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <Unlock className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
            <h2 className="text-lg font-semibold text-slate-900">
              Abrir Turno de Caja
            </h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Ingrese el fondo inicial en efectivo con el que arranca el turno.
          </p>
          <form onSubmit={handleOpen} className="space-y-4">
            <div>
              <label
                htmlFor="opening-float"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Fondo inicial ($)
              </label>
              <input
                id="opening-float"
                type="number"
                min="0"
                step="0.50"
                value={floatPesos}
                onChange={(e) => setFloatPesos(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-slate-300 text-lg font-semibold tabular-nums"
              />
            </div>
            <button
              type="submit"
              disabled={!perms.canOpenCloseShift}
              className="w-full min-h-12 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold px-4 py-2.5 active:scale-[0.98] transition"
            >
              Abrir caja ahora
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Resumen y Corte */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Turno abierto
                </span>
                <h2 className="text-lg font-semibold text-slate-900 mt-1">
                  Corte de Caja
                </h2>
                <p className="text-xs text-slate-600">
                  Abrió: {openShift.openedByUserName}
                </p>
              </div>
              <Calculator className="w-6 h-6 text-slate-400" strokeWidth={1.75} />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Fondo inicial</span>
                <span className="font-semibold tabular-nums">
                  {formatMXN(openShift.openingFloatCents)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Tickets cobrados</span>
                <span className="font-semibold tabular-nums">
                  {shiftSales.filter((s) => s.status === "completed").length}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
                <span className="font-semibold text-slate-900">
                  Efectivo esperado en cajón
                </span>
                {settings.blindCashCount &&
                currentUser.role !== "owner" &&
                currentUser.role !== "manager" ? (
                  <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded">
                    Oculto (Arqueo ciego)
                  </span>
                ) : (
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatMXN(expectedCashCents)}
                  </span>
                )}
              </div>
              {settings.maxDrawerCashCents > 0 &&
                expectedCashCents > settings.maxDrawerCashCents && (
                  <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    El cajón superó {formatMXN(settings.maxDrawerCashCents)}. Se
                    recomienda hacer un retiro parcial.
                  </p>
                )}
            </div>

            <form onSubmit={handleClose} className="space-y-3 pt-2 border-t border-slate-200">
              <div>
                <label
                  htmlFor="counted-cash"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Efectivo contado físicamente ($)
                </label>
                <input
                  id="counted-cash"
                  type="number"
                  min="0"
                  step="0.50"
                  value={countedPesos}
                  onChange={(e) => setCountedPesos(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-12 px-4 rounded-lg border border-slate-300 text-lg font-bold text-right tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={!perms.canOpenCloseShift}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-semibold px-4 py-2.5 active:scale-[0.98] transition"
              >
                <Lock className="w-4 h-4" strokeWidth={1.75} />
                Realizar corte y cerrar caja
              </button>
            </form>
          </div>

          {/* Entradas y salidas de efectivo */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-3">
                Entradas y Retiros de Efectivo
              </h3>
              <form onSubmit={handleMovement} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMovType("withdrawal")}
                      className={`flex-1 min-h-11 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 ${
                        movType === "withdrawal"
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      <ArrowUpCircle className="w-4 h-4" strokeWidth={1.75} />
                      Retiro
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovType("deposit")}
                      className={`flex-1 min-h-11 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 ${
                        movType === "deposit"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      <ArrowDownCircle className="w-4 h-4" strokeWidth={1.75} />
                      Entrada
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={movAmountPesos}
                    onChange={(e) => setMovAmountPesos(e.target.value)}
                    placeholder="Monto ($)"
                    className="h-11 px-3 rounded-lg border border-slate-300 text-sm font-semibold tabular-nums"
                  />
                  <input
                    type="text"
                    value={movReason}
                    onChange={(e) => setMovReason(e.target.value)}
                    placeholder="Motivo obligatorio"
                    className="h-11 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-11 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold active:scale-[0.98] transition"
                >
                  Registrar movimiento
                </button>
              </form>

              {openShift.movements.length > 0 && (
                <div className="mt-4 divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {openShift.movements.map((m) => (
                    <div
                      key={m.id}
                      className="px-3.5 py-2.5 flex items-center justify-between text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{m.reason}</p>
                        <p className="text-xs text-slate-500">{m.userName}</p>
                      </div>
                      <span
                        className={`font-bold tabular-nums ${
                          m.type === "deposit"
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        {m.type === "deposit" ? "+" : "-"}
                        {formatMXN(m.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tickets del turno y cancelación auditada */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-3">
                Ventas del Turno ({shiftSales.length})
              </h3>
              {shiftSales.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Aún no hay ventas cobradas en este turno.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                  {shiftSales.map((s) => (
                    <div
                      key={s.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">
                          Folio #{s.folio}{" "}
                          {s.status === "cancelled" && (
                            <span className="ml-1.5 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                              Cancelada
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-600">
                          {s.items.length} prod. • Cobró: {s.createdByUserName}
                          {s.cancelReason ? ` • Motivo: ${s.cancelReason}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                          {formatMXN(s.totalCents)}
                        </span>
                        {s.status === "completed" && (
                          <button
                            type="button"
                            onClick={() => setCancelSaleId(s.id)}
                            className="min-h-9 px-2.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Ban className="w-3.5 h-3.5" strokeWidth={1.75} />
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historial de cortes cerrados */}
      {shifts.some((s) => s.status === "closed") && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-3">
            Historial de Cortes de Caja
          </h3>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {shifts
              .filter((s) => s.status === "closed")
              .map((s) => {
                const diff = s.differenceCents ?? 0;
                return (
                  <div
                    key={s.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        Cerró: {s.closedByUserName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.closedAt
                          ? new Date(s.closedAt).toLocaleString("es-MX")
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 tabular-nums">
                      <span className="text-slate-600">
                        Esperado: {formatMXN(s.expectedCashCents ?? 0)}
                      </span>
                      <span className="font-semibold text-slate-900">
                        Contado: {formatMXN(s.countedCashCents ?? 0)}
                      </span>
                      <span
                        className={`font-bold px-2.5 py-0.5 rounded text-xs ${
                          diff === 0
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-red-50 text-red-800"
                        }`}
                      >
                        Dif: {diff >= 0 ? "+" : ""}
                        {formatMXN(diff)}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Modal de cancelación de venta */}
      {cancelSaleId && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar venta"
        >
          <form
            onSubmit={handleConfirmCancel}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Cancelar venta y devolver stock
            </h3>
            <p className="text-sm text-slate-600">
              Esta acción quedará registrada en la bitácora anti-robo.
            </p>
            <div>
              <label
                htmlFor="cancel-reason"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Motivo obligatorio
              </label>
              <input
                id="cancel-reason"
                type="text"
                autoFocus
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej. Error de captura en cantidad"
                className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            {!perms.canCancelSale && (
              <div>
                <label
                  htmlFor="cancel-sup-pin"
                  className="block text-sm font-medium text-amber-900 mb-1"
                >
                  PIN de autorización (Dueño o Encargado)
                </label>
                <input
                  id="cancel-sup-pin"
                  type="password"
                  inputMode="numeric"
                  value={supervisorPin}
                  onChange={(e) =>
                    setSupervisorPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="••••"
                  className="w-full h-11 px-3 rounded-lg border border-amber-300 text-sm"
                />
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setCancelSaleId(null)}
                className="min-h-11 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700"
              >
                Volver
              </button>
              <button
                type="submit"
                className="min-h-11 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
              >
                Confirmar cancelación
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

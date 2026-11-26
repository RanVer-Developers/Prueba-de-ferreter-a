import { useEffect, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Lock,
  Receipt,
  Unlock,
} from 'lucide-react';
import type { CreditNoteTrack, FerreteriaApp } from '@ferreteria/core';
import { formatMoneyCents, formatPesos, humanizeError } from '../utils/format';

interface CashierViewProps {
  app: FerreteriaApp;
  revision: number;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  requestOwnerPin: (title: string, description: string) => Promise<string | null>;
}

export function CashierView({
  app,
  revision,
  onDataChanged,
  onNotify,
  requestOwnerPin,
}: CashierViewProps) {
  const [shiftOpen, setShiftOpen] = useState(false);
  const [initialAmountPesos, setInitialAmountPesos] = useState('500');
  const [declaredClosePesos, setDeclaredClosePesos] = useState('');
  const [lastCloseResult, setLastCloseResult] = useState<{
    declaredPesos: number;
    expectedPesos: number;
    discrepancyPesos: number;
  } | null>(null);

  const [parkedOrders, setParkedOrders] = useState<
    Awaited<ReturnType<FerreteriaApp['listParkedOrders']>>
  >([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteTrack[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH');

  // Expense state
  const [expenseAmountPesos, setExpenseAmountPesos] = useState('');
  const [expenseReason, setExpenseReason] = useState('');

  // Partial credit payment
  const [abonoAmounts, setAbonoAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function load() {
      const parked = await app.listParkedOrders();
      if (active) {
        setShiftOpen(app.getActiveShiftStatus().isOpen);
        setParkedOrders(parked);
        setCreditNotes(app.listCreditNotes());
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [app, revision]);

  const handleOpenShift = async () => {
    try {
      const amount = Number(initialAmountPesos);
      await app.openCashierShift({ cashierId: 'cashier-1', initialAmountPesos: amount });
      setLastCloseResult(null);
      onDataChanged();
      onNotify('success', `Turno abierto con fondo inicial de ${formatPesos(amount)}.`);
    } catch (err) {
      app.logError({ screen: 'Caja', action: 'Abrir turno', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handlePayCash = async (orderId: string, grandTotalCents: number) => {
    try {
      await app.payOrderAtCashier({
        orderId,
        cashierId: 'cashier-1',
        payments: [{ method: paymentMethod, amountCents: grandTotalCents }],
      });
      onDataChanged();
      onNotify('success', `Nota ${orderId} cobrada (${formatMoneyCents(grandTotalCents)}).`);
    } catch (err) {
      app.logError({ screen: 'Caja', action: 'Cobrar nota', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleChargeCredit = async (orderId: string, customerId?: string) => {
    if (!customerId) {
      onNotify(
        'error',
        'Para vender a crédito (fiado), la nota debe tener un cliente registrado desde Mostrador.'
      );
      return;
    }
    try {
      await app.chargeOrderToCredit({
        orderId,
        customerId,
        cashierId: 'cashier-1',
      });
      onDataChanged();
      onNotify('success', `Nota ${orderId} cargada al crédito del cliente.`);
    } catch (err) {
      const msg = humanizeError(err);
      if (msg.includes('PIN del Dueño')) {
        const pin = await requestOwnerPin(
          'Autorización de Crédito Excedido o Vencido',
          'Este cliente superó su límite o tiene notas vencidas. Ingrese el PIN del Dueño para autorizar la venta a crédito.'
        );
        if (!pin) return;
        try {
          await app.chargeOrderToCredit({
            orderId,
            customerId,
            cashierId: 'cashier-1',
            ownerPinOverride: pin,
          });
          onDataChanged();
          onNotify('success', `Nota ${orderId} autorizada a crédito con PIN del Dueño.`);
        } catch (retryErr) {
          onNotify('error', humanizeError(retryErr));
        }
        return;
      }
      app.logError({ screen: 'Caja', action: 'Cargar a crédito', error: err });
      onNotify('error', msg);
    }
  };

  const handleRecordAbono = async (note: CreditNoteTrack) => {
    const pesos = Number(abonoAmounts[note.noteId] || 0);
    if (pesos <= 0) {
      onNotify('error', 'Ingrese un monto de abono válido.');
      return;
    }
    try {
      const updated = await app.recordCreditNotePayment({
        noteId: note.noteId,
        amountCents: Math.round(pesos * 100),
        cashierId: 'cashier-1',
        method: paymentMethod,
      });
      setAbonoAmounts((prev) => ({ ...prev, [note.noteId]: '' }));
      onDataChanged();
      onNotify(
        'success',
        `Abono registrado a la nota ${note.noteId}. Saldo restante: ${formatMoneyCents(updated.remainingCents)}.`
      );
    } catch (err) {
      app.logError({ screen: 'Caja', action: 'Abono de crédito', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleRecordExpense = async () => {
    const amount = Number(expenseAmountPesos);
    if (amount <= 0 || !expenseReason.trim()) {
      onNotify('error', 'Debe indicar el monto y el motivo obligatorio del gasto.');
      return;
    }
    try {
      await app.recordCashExpense({
        cashierId: 'cashier-1',
        amountPesos: amount,
        reason: expenseReason,
        category: 'SUPPLIES',
      });
      setExpenseAmountPesos('');
      setExpenseReason('');
      onDataChanged();
      onNotify('success', `Gasto menor de ${formatPesos(amount)} registrado.`);
    } catch (err) {
      app.logError({ screen: 'Caja', action: 'Registrar gasto', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleCloseBlind = async () => {
    const declared = Number(declaredClosePesos);
    if (Number.isNaN(declared) || declared < 0 || declaredClosePesos === '') {
      onNotify('error', 'Cuente el efectivo en gaveta e ingrese el monto total declarado.');
      return;
    }
    try {
      const res = await app.closeCashierShiftBlind({
        cashierId: 'cashier-1',
        declaredCashPesos: declared,
      });
      setLastCloseResult(res);
      setDeclaredClosePesos('');
      onDataChanged();
      onNotify('success', 'Turno cerrado y arqueo ciego registrado.');
    } catch (err) {
      app.logError({ screen: 'Caja', action: 'Cierre de turno', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Caja Principal y Cuentas por Cobrar
          </h2>
          <p className="text-sm text-slate-600">
            Cobre las notas enviadas desde mostrador, reciba abonos a crédito y realice el arqueo
            ciego al cierre.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border bg-white">
          {shiftOpen ? (
            <span className="text-emerald-700 inline-flex items-center gap-1.5">
              <Unlock className="w-4 h-4" strokeWidth={1.75} /> Turno Abierto
            </span>
          ) : (
            <span className="text-amber-700 inline-flex items-center gap-1.5">
              <Lock className="w-4 h-4" strokeWidth={1.75} /> Turno Cerrado
            </span>
          )}
        </div>
      </div>

      {!shiftOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Abrir Turno de Caja</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="initial-float" className="block text-sm font-medium text-slate-700 mb-1">
                Fondo inicial en efectivo (pesos)
              </label>
              <input
                id="initial-float"
                type="number"
                min="0"
                value={initialAmountPesos}
                onChange={(e) => setInitialAmountPesos(e.target.value)}
                className="w-48 min-h-[44px] px-3 border border-slate-300 rounded-lg tabular-nums text-base"
              />
            </div>
            <button
              type="button"
              onClick={handleOpenShift}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-[#1E3A5F] text-white font-semibold hover:bg-[#162D4A]"
            >
              Abrir Turno
            </button>
          </div>
          {lastCloseResult && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm space-y-1 tabular-nums">
              <p className="font-semibold text-slate-900">Resultado del último arqueo ciego:</p>
              <p>Efectivo contado: {formatPesos(lastCloseResult.declaredPesos)}</p>
              <p>Efectivo esperado: {formatPesos(lastCloseResult.expectedPesos)}</p>
              <p
                className={`font-semibold ${
                  lastCloseResult.discrepancyPesos === 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                Diferencia: {formatPesos(lastCloseResult.discrepancyPesos)}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Notas en espera */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
              Notas por Cobrar ({parkedOrders.length})
            </h3>
            <select
              aria-label="Forma de pago"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}
              className="min-h-[40px] px-3 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="TRANSFER">Transferencia</option>
            </select>
          </div>

          {parkedOrders.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No hay notas en espera. Las notas enviadas desde Mostrador aparecerán aquí.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {parkedOrders.map((order) => (
                <div
                  key={order.orderId}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{order.customerName}</p>
                    <p className="text-xs text-slate-500">
                      Nota {order.orderId} · {order.lineCount} artículos ·{' '}
                      {order.deliveryMode === 'COUNTER_IMMEDIATE'
                        ? 'Mostrador'
                        : order.deliveryMode === 'WAREHOUSE_PICKUP'
                          ? 'Recolección en Bodega'
                          : 'Envío a Domicilio'}
                    </p>
                    <p className="text-lg font-bold text-[#1E3A5F] tabular-nums mt-1">
                      {formatMoneyCents(order.grandTotalCents)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!shiftOpen}
                      onClick={() => handlePayCash(order.orderId, order.grandTotalCents)}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Banknote className="w-4 h-4" strokeWidth={1.75} />
                      Cobrar Contado
                    </button>
                    {order.customerId && (
                      <button
                        type="button"
                        onClick={() => handleChargeCredit(order.orderId, order.customerId)}
                        className="min-h-[44px] px-3.5 py-2 rounded-lg border border-amber-600 text-amber-800 bg-amber-50 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-amber-100"
                      >
                        <CreditCard className="w-4 h-4" strokeWidth={1.75} />
                        Cargar a Crédito
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gastos y Arqueo Ciego */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-600" strokeWidth={1.75} />
              Registrar Gasto Menor (Efectivo)
            </h3>
            <div className="space-y-3">
              <input
                type="number"
                min="1"
                placeholder="Monto en pesos (ej. 150)"
                value={expenseAmountPesos}
                onChange={(e) => setExpenseAmountPesos(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
              />
              <input
                type="text"
                placeholder="Motivo obligatorio (ej. Gasolina camioneta)"
                value={expenseReason}
                onChange={(e) => setExpenseReason(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm"
              />
              <button
                type="button"
                disabled={!shiftOpen}
                onClick={handleRecordExpense}
                className="w-full min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                Registrar Salida de Efectivo
              </button>
            </div>
          </div>

          {shiftOpen && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Cierre de Turno (Arqueo Ciego)
              </h3>
              <p className="text-xs text-slate-600">
                Cuente el efectivo físico en gaveta e ingréselo sin ver el esperado. Al cerrar se
                mostrará la diferencia.
              </p>
              <input
                type="number"
                min="0"
                placeholder="Total efectivo contado (pesos)"
                value={declaredClosePesos}
                onChange={(e) => setDeclaredClosePesos(e.target.value)}
                className="w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
              />
              <button
                type="button"
                onClick={handleCloseBlind}
                className="w-full min-h-[44px] px-4 py-2 rounded-lg bg-[#1E3A5F] text-white font-semibold hover:bg-[#162D4A]"
              >
                Cerrar Turno y Realizar Arqueo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Abonos de crédito por nota */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Notas de Crédito Activas y Abonos ({creditNotes.filter((n) => n.status !== 'PAID').length})
        </h3>
        {creditNotes.length === 0 ? (
          <p className="text-sm text-slate-500">No hay notas de crédito registradas.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {creditNotes.map((note) => (
              <div
                key={note.noteId}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">Nota {note.noteId}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        note.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {note.status === 'PAID' ? 'Liquidada' : note.status === 'PARTIAL' ? 'Abono Parcial' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Vence: {new Date(note.dueAt).toLocaleDateString('es-MX')} · Total original:{' '}
                    {formatMoneyCents(note.originalTotalCents)}
                  </p>
                  <p className="font-bold text-slate-900 tabular-nums">
                    Saldo pendiente: {formatMoneyCents(note.remainingCents)}
                  </p>
                </div>

                {note.status !== 'PAID' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Abono ($)"
                      value={abonoAmounts[note.noteId] ?? ''}
                      onChange={(e) =>
                        setAbonoAmounts((prev) => ({ ...prev, [note.noteId]: e.target.value }))
                      }
                      className="w-32 min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={!shiftOpen}
                      onClick={() => handleRecordAbono(note)}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-[#1E3A5F] text-white text-sm font-semibold hover:bg-[#162D4A] disabled:opacity-50"
                    >
                      Registrar Abono
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-700 text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} /> Pagada
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

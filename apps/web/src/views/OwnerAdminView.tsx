import React, { useEffect, useState } from 'react';
import { BarChart3, Copy, Download, ShieldCheck, Upload } from 'lucide-react';
import type { DailySummaryReport, FerreteriaApp, OwnerControlsConfig } from '@ferreteria/core';
import { formatMoneyCents, humanizeError } from '../utils/format';

interface OwnerAdminViewProps {
  app: FerreteriaApp;
  revision: number;
  onDataChanged: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  requestOwnerPin: (title: string, description: string) => Promise<string | null>;
}

export function OwnerAdminView({
  app,
  revision,
  onDataChanged,
  onNotify,
  requestOwnerPin,
}: OwnerAdminViewProps) {
  const [summary, setSummary] = useState<DailySummaryReport | null>(null);
  const [controls, setControls] = useState<OwnerControlsConfig>(app.getOwnerControls());

  useEffect(() => {
    let active = true;
    async function load() {
      const rep = await app.getDailySummary();
      if (active) {
        setSummary(rep);
        setControls(app.getOwnerControls());
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [app, revision]);

  const handleToggleControl = async (
    patch: Partial<OwnerControlsConfig>,
    label: string
  ) => {
    const pin = await requestOwnerPin(
      'Cambiar Regla de Negocio',
      `Se requiere el PIN del Dueño para modificar: ${label}.`
    );
    if (!pin) return;

    try {
      const updated = await app.updateOwnerControls(patch, pin);
      setControls(updated);
      onDataChanged();
      onNotify('success', `Regla "${label}" actualizada correctamente.`);
    } catch (err) {
      app.logError({ screen: 'Dueño', action: 'Actualizar regla', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const json = await app.exportBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respaldo-tornillo-fuerte-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('success', 'Archivo de respaldo .json descargado.');
    } catch (err) {
      app.logError({ screen: 'Dueño', action: 'Exportar respaldo', error: err });
      onNotify('error', humanizeError(err));
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await app.importBackupJson(text);
      onDataChanged();
      onNotify('success', 'Respaldo restaurado correctamente.');
    } catch (err) {
      app.logError({ screen: 'Dueño', action: 'Restaurar respaldo', error: err });
      onNotify('error', humanizeError(err));
    } finally {
      e.target.value = '';
    }
  };

  const handleCopyTechnicalReport = async () => {
    const report = app.exportTechnicalErrorReport();
    try {
      await navigator.clipboard.writeText(report);
      onNotify('success', 'Reporte técnico copiado al portapapeles.');
    } catch {
      onNotify('info', report);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Resumen del Dueño, Reglas y Respaldos
        </h2>
        <p className="text-sm text-slate-600">
          Consulte las ventas del día, ajuste candados operativos sin programar y descargue su
          respaldo local.
        </p>
      </div>

      {/* Resumen diario */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Ventas de Contado
            </p>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
              {formatMoneyCents(summary.cashSalesCents)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Ventas a Crédito (Fiado)
            </p>
            <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
              {formatMoneyCents(summary.creditSalesCents)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Dinero Neto en Caja Hoy
            </p>
            <p className="text-2xl font-bold text-[#1E3A5F] tabular-nums mt-1">
              {formatMoneyCents(summary.netCashInDrawerCents)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Pendientes Bodega / Resurtir
            </p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {summary.pendingDispatchCount} entregas · {summary.lowStockCount} por pedir
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Panel de reglas del Dueño */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
            Candados y Reglas de Operación
          </h3>

          <div className="divide-y divide-slate-200">
            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900 text-sm">
                  Bloquear venta si el inventario está en cero
                </p>
                <p className="text-xs text-slate-500">
                  Requiere PIN del Dueño para vender sin existencia.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleToggleControl(
                    { blockZeroStockWithoutOwnerPin: !controls.blockZeroStockWithoutOwnerPin },
                    'Bloqueo en stock cero'
                  )
                }
                className={`min-h-[40px] px-3.5 rounded-lg text-sm font-semibold ${
                  controls.blockZeroStockWithoutOwnerPin
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {controls.blockZeroStockWithoutOwnerPin ? 'Activado' : 'Desactivado'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900 text-sm">
                  Arqueo ciego al cerrar turno de caja
                </p>
                <p className="text-xs text-slate-500">
                  El cajero cuenta el dinero sin ver cuánto esperaba el sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleToggleControl(
                    { blindCashCountOnClose: !controls.blindCashCountOnClose },
                    'Arqueo ciego'
                  )
                }
                className={`min-h-[40px] px-3.5 rounded-lg text-sm font-semibold ${
                  controls.blindCashCountOnClose
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {controls.blindCashCountOnClose ? 'Activado' : 'Desactivado'}
              </button>
            </div>

            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900 text-sm">
                  Bloquear crédito excedido o vencido sin PIN
                </p>
                <p className="text-xs text-slate-500">
                  Exige autorización del Dueño para fiar por encima del límite.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleToggleControl(
                    {
                      blockExceededCreditWithoutOwnerPin:
                        !controls.blockExceededCreditWithoutOwnerPin,
                    },
                    'Bloqueo de crédito excedido'
                  )
                }
                className={`min-h-[40px] px-3.5 rounded-lg text-sm font-semibold ${
                  controls.blockExceededCreditWithoutOwnerPin
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {controls.blockExceededCreditWithoutOwnerPin ? 'Activado' : 'Desactivado'}
              </button>
            </div>
          </div>
        </div>

        {/* Respaldos y Soporte */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1E3A5F]" strokeWidth={1.75} />
            Respaldo Local y Soporte Técnico
          </h3>
          <p className="text-sm text-slate-600">
            Sus datos se guardan automáticamente en este dispositivo. Descargue un archivo de
            respaldo `.json` al final del día para mayor seguridad.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#1E3A5F] text-white font-semibold inline-flex items-center gap-2 hover:bg-[#162D4A]"
            >
              <Download className="w-4 h-4" strokeWidth={1.75} />
              Descargar Respaldo (.json)
            </button>

            <label className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-semibold inline-flex items-center gap-2 hover:bg-slate-50 cursor-pointer">
              <Upload className="w-4 h-4" strokeWidth={1.75} />
              Restaurar Respaldo
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleRestoreBackup}
                className="sr-only"
              />
            </label>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-2">
            <p className="text-sm font-medium text-slate-800">Ayuda y Soporte</p>
            <button
              type="button"
              onClick={handleCopyTechnicalReport}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 text-sm font-medium inline-flex items-center gap-2 hover:bg-slate-100"
            >
              <Copy className="w-4 h-4" strokeWidth={1.75} />
              Copiar reporte técnico
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

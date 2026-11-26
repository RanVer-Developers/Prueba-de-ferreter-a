import React from 'react';
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onCopyReport?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Error inesperado en la pantalla.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={1.75} />
              <h1 className="text-lg font-semibold text-slate-900">
                Ocurrió un problema en la pantalla
              </h1>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sus datos locales siguen protegidos. Puede recargar esta vista o copiar el reporte
              técnico para soporte.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-[#1E3A5F] text-white font-medium inline-flex items-center gap-2 hover:bg-[#162D4A] active:scale-[0.98]"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
                Recargar pantalla
              </button>
              {this.props.onCopyReport && (
                <button
                  type="button"
                  onClick={this.props.onCopyReport}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium inline-flex items-center gap-2 hover:bg-slate-50 active:scale-[0.98]"
                >
                  <Copy className="w-4 h-4" strokeWidth={1.75} />
                  Copiar reporte técnico
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

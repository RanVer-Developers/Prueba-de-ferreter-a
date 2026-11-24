import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { recordErrorLog } from "../core/error-log.js";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    recordErrorLog("Aplicación", info.componentStack ?? "Render", error);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-left">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" strokeWidth={1.75} />
              <h1 className="text-lg font-semibold text-slate-900">
                Ocurrió un problema inesperado
              </h1>
            </div>
            <p className="text-slate-600 text-sm mb-5 leading-relaxed">
              Sus datos locales están seguros. Recargue la pantalla para continuar
              operando con normalidad.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white font-medium px-4 py-2.5 hover:bg-slate-800 active:scale-[0.98] transition"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
              Recargar pantalla
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

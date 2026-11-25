import { Component, type ReactNode } from 'react';
import { Button } from './kit';

export class ErrorBoundary extends Component<{ children: ReactNode; onError?: (e: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError?.(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-full place-items-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-2xl font-semibold">Algo salió mal</h1>
          <p className="text-muted">Tus datos están a salvo. Recarga la pantalla; si sigue pasando, abre Ayuda y copia el reporte técnico.</p>
          <Button onClick={() => location.reload()}>Recargar</Button>
        </div>
      </div>
    );
  }
}

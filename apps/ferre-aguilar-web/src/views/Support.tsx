import { ClipboardCopy, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Session } from '../data/ferre';
import { useApp } from '../app-context';
import { Button, Modal } from '../ui/kit';

export function SupportButton({ session }: { session: Session }) {
  const { ferre } = useApp();
  const [open, setOpen] = useState(false);

  const copy = async () => {
    const errors = await ferre.listErrors();
    const report = [
      `Reporte técnico — Ferre Aguilar — ${new Date().toLocaleString('es-MX')}`,
      `Usuario: ${session.name} (${session.role})`,
      `Navegador: ${navigator.userAgent}`,
      `Sin conexión: ${navigator.onLine ? 'no' : 'sí'}`,
      '',
      ...(errors.length === 0 ? ['Sin errores recientes.'] : errors.slice(0, 50).map((e) => `${e.at} | ${e.screen} | ${e.action} | ${e.detail}`)),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(report);
      toast.success('Reporte copiado. Pégalo en un mensaje a soporte.');
    } catch {
      toast.error('No pudimos copiar. Selecciona el texto y cópialo a mano.');
      window.prompt('Copia este reporte:', report);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 items-center gap-2 rounded-md px-3 text-white/90 hover:bg-white/10">
        <LifeBuoy size={20} aria-hidden /> Ayuda
      </button>
      {open && (
        <Modal title="Ayuda" onClose={() => setOpen(false)}>
          <p className="mb-4 text-muted">Si algo no funciona, copia el reporte técnico y mándalo a soporte. No incluye contraseñas ni datos de clientes.</p>
          <Button className="w-full" onClick={copy}><ClipboardCopy size={20} aria-hidden /> Copiar reporte técnico</Button>
        </Modal>
      )}
    </>
  );
}

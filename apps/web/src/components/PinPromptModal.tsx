import React, { useEffect, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';

interface PinPromptModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: (pin: string) => void;
}

export function PinPromptModal({
  isOpen,
  title,
  description,
  onCancel,
  onConfirm,
}: PinPromptModalProps) {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim()) {
      onConfirm(pin.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[#1E3A5F]">
            <Lock className="w-5 h-5 shrink-0" strokeWidth={1.75} />
            <h2 id="pin-modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar ventana"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="owner-pin-input" className="block text-sm font-medium text-slate-700 mb-1">
              PIN del Dueño / Encargado (por defecto: 9999)
            </label>
            <input
              ref={inputRef}
              id="owner-pin-input"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Ingrese el PIN"
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-lg bg-[#1E3A5F] text-white font-medium hover:bg-[#162D4A] active:scale-[0.98]"
            >
              Autorizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

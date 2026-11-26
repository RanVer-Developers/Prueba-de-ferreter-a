import { Money } from '@modulos/core-shared';

export function formatMoneyCents(cents: number): string {
  return Money.fromCents(cents, 'MXN').format();
}

export function formatPesos(pesos: number): string {
  return Money.fromDecimal(pesos, 'MXN').format();
}

export function humanizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return 'Ocurrió un inconveniente inesperado. Por favor, intente de nuevo.';
}

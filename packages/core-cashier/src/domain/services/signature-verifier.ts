import { Money } from '../value-objects/money.js';

export interface SignatureVerificationInput {
  readonly shiftId: string;
  readonly supervisorId: string;
  /** Cadena canónica que el supervisor firmó (ver `buildReconciliationSignaturePayload`). */
  readonly payload: string;
  readonly token: string;
}

/**
 * Puerto para verificar la firma/PIN/token del supervisor que sella un arqueo.
 * La implementación (HMAC, JWT, PIN hash, biometría) la aporta cada proyecto.
 */
export interface ISignatureVerifier {
  verify(input: SignatureVerificationInput): boolean | Promise<boolean>;
}

/**
 * Construye el payload canónico que debe firmar el supervisor: liga la firma al turno,
 * al supervisor y al efectivo declarado, evitando reutilizar un token en otro arqueo.
 */
export function buildReconciliationSignaturePayload(
  shiftId: string,
  supervisorId: string,
  declaredCash: Money
): string {
  return `${shiftId}|${supervisorId}|${declaredCash.toCents()}|${declaredCash.currency}`;
}

import { CashMovement } from '../domain/entities/cash-movement.js';
import { CashShift, ShiftStatus } from '../domain/entities/cash-shift.js';

export interface ShiftQueryFilter {
  cashRegisterIds?: string[];
  from?: Date;
  to?: Date;
  statuses?: ShiftStatus[];
}

export interface ICashShiftRepository {
  findById(id: string): Promise<CashShift | null>;
  findActiveByCashRegisterId(cashRegisterId: string): Promise<CashShift | null>;
  /**
   * Persiste el turno. Los repositorios reales deben aplicar bloqueo optimista comparando
   * `shift.persistedVersion` con la versión almacenada y lanzar `ConcurrencyError` ante conflicto;
   * tras guardar deben invocar `shift.markPersisted()`.
   */
  save(shift: CashShift): Promise<void>;
  findByCashRegisterId(cashRegisterId: string, limit?: number): Promise<CashShift[]>;
  /**
   * Opcional: busca movimientos (de cualquier turno) por referencia de transacción.
   * Permite vincular reembolsos a ventas de turnos anteriores.
   */
  findMovementsByReferenceId?(referenceId: string): Promise<CashMovement[]>;
  /**
   * Opcional: consulta turnos filtrados por cajas, rango de fechas y estados (para reportes consolidados).
   */
  findByFilter?(filter: ShiftQueryFilter): Promise<CashShift[]>;
}

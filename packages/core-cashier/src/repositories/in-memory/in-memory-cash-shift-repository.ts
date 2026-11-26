import { ConcurrencyError } from '../../domain/errors/cashier-errors.js';
import { CashMovement } from '../../domain/entities/cash-movement.js';
import { CashShift, CashShiftSnapshot } from '../../domain/entities/cash-shift.js';
import { ICashShiftRepository } from '../cash-shift-repository.interface.js';

export interface InMemoryCashShiftRepositoryOptions {
  /**
   * Si es true (por defecto), el repositorio se comporta como una base de datos real: guarda y devuelve COPIAS
   * (snapshots serializados) y aplica bloqueo optimista por versión (`ConcurrencyError`).
   */
  isolate?: boolean;
}

export class InMemoryCashShiftRepository implements ICashShiftRepository {
  private readonly items = new Map<string, CashShift>();
  private readonly snapshots = new Map<string, CashShiftSnapshot>();
  private readonly isolate: boolean;

  public constructor(options: InMemoryCashShiftRepositoryOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  private load(id: string): CashShift | null {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? CashShift.fromSnapshot(JSON.parse(JSON.stringify(snap))) : null;
    }
    return this.items.get(id) || null;
  }

  private all(): CashShift[] {
    if (this.isolate) {
      return Array.from(this.snapshots.keys()).map((id) => this.load(id)!);
    }
    return Array.from(this.items.values());
  }

  public async findById(id: string): Promise<CashShift | null> {
    return this.load(id);
  }

  public async findActiveByCashRegisterId(cashRegisterId: string): Promise<CashShift | null> {
    for (const shift of this.all()) {
      if (shift.cashRegisterId === cashRegisterId && !shift.isClosed()) {
        return shift;
      }
    }
    return null;
  }

  public async save(shift: CashShift): Promise<void> {
    if (this.isolate) {
      const stored = this.snapshots.get(shift.id);
      if (stored && stored.version !== shift.persistedVersion) {
        throw new ConcurrencyError(shift.id, shift.persistedVersion, stored.version);
      }
      this.snapshots.set(shift.id, JSON.parse(JSON.stringify(shift.toSnapshot())));
      shift.markPersisted();
      return;
    }
    this.items.set(shift.id, shift);
    shift.markPersisted();
  }

  public async findByCashRegisterId(cashRegisterId: string, limit = 50): Promise<CashShift[]> {
    const results = this.all().filter((s) => s.cashRegisterId === cashRegisterId);
    // Ordenar descendente por fecha de apertura
    results.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
    return results.slice(0, limit);
  }

  public async findMovementsByReferenceId(referenceId: string): Promise<CashMovement[]> {
    const out: CashMovement[] = [];
    for (const shift of this.all()) {
      out.push(...shift.findMovementsByReferenceId(referenceId));
    }
    return out;
  }

  public async findByFilter(filter: {
    cashRegisterIds?: string[];
    from?: Date;
    to?: Date;
    statuses?: string[];
  }): Promise<CashShift[]> {
    return this.all().filter((s) => {
      if (filter.cashRegisterIds && !filter.cashRegisterIds.includes(s.cashRegisterId)) {
        return false;
      }
      if (filter.statuses && !filter.statuses.includes(s.status)) {
        return false;
      }
      if (filter.from && s.openedAt < filter.from) {
        return false;
      }
      if (filter.to && s.openedAt > filter.to) {
        return false;
      }
      return true;
    });
  }

  public clear(): void {
    this.items.clear();
    this.snapshots.clear();
  }
}

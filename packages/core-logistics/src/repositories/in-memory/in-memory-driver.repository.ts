import { IDriverRepository } from '../../contracts/logistics-contracts.js';
import { Driver } from '../../domain/entities/driver.js';
import { ConcurrencyError } from '../../domain/errors/logistics-errors.js';
import { DriverJSON, DriverStatus } from '../../schemas/logistics-schemas.js';

export class InMemoryDriverRepository implements IDriverRepository {
  private readonly store = new Map<string, DriverJSON>();

  async findById(id: string): Promise<Driver | null> {
    const raw = this.store.get(id);
    return raw ? Driver.fromJSON(structuredClone(raw)) : null;
  }

  async findByStatus(status: DriverStatus): Promise<Driver[]> {
    const results: Driver[] = [];
    for (const raw of this.store.values()) {
      if (raw.status === status) {
        results.push(Driver.fromJSON(structuredClone(raw)));
      }
    }
    return results;
  }

  async save(driver: Driver): Promise<void> {
    const existing = this.store.get(driver.id);
    const currentVersion = existing ? existing.version : 0;

    if (currentVersion !== driver.persistedVersion) {
      throw new ConcurrencyError(
        'driver',
        driver.id,
        driver.persistedVersion,
        currentVersion
      );
    }

    this.store.set(driver.id, structuredClone(driver.toJSON()));
    driver.markPersisted();
  }
}

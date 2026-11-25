import { IDeliveryRouteRepository } from '../../contracts/logistics-contracts.js';
import { DeliveryRoute } from '../../domain/entities/delivery-route.js';
import { ConcurrencyError } from '../../domain/errors/logistics-errors.js';
import { DeliveryRouteJSON, DeliveryRouteStatus } from '../../schemas/logistics-schemas.js';

export class InMemoryRouteRepository implements IDeliveryRouteRepository {
  private readonly store = new Map<string, DeliveryRouteJSON>();

  async findById(id: string): Promise<DeliveryRoute | null> {
    const raw = this.store.get(id);
    return raw ? DeliveryRoute.fromJSON(structuredClone(raw)) : null;
  }

  async findByDriverId(
    driverId: string,
    status?: DeliveryRouteStatus
  ): Promise<DeliveryRoute[]> {
    const results: DeliveryRoute[] = [];
    for (const raw of this.store.values()) {
      if (raw.driverId !== driverId) continue;
      if (status && raw.status !== status) continue;
      results.push(DeliveryRoute.fromJSON(structuredClone(raw)));
    }
    return results;
  }

  async save(route: DeliveryRoute): Promise<void> {
    const existing = this.store.get(route.id);
    const currentVersion = existing ? existing.version : 0;

    if (currentVersion !== route.persistedVersion) {
      throw new ConcurrencyError('route', route.id, route.persistedVersion, currentVersion);
    }

    this.store.set(route.id, structuredClone(route.toJSON()));
    route.markPersisted();
  }
}

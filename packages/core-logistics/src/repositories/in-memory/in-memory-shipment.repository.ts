import {
  IShipmentRepository,
  ShipmentQueryFilter,
} from '../../contracts/logistics-contracts.js';
import { Shipment } from '../../domain/entities/shipment.js';
import { ConcurrencyError } from '../../domain/errors/logistics-errors.js';
import { ShipmentJSON } from '../../schemas/logistics-schemas.js';

export class InMemoryShipmentRepository implements IShipmentRepository {
  private readonly store = new Map<string, ShipmentJSON>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly trackingIndex = new Map<string, string>();

  async findById(id: string): Promise<Shipment | null> {
    const raw = this.store.get(id);
    return raw ? Shipment.fromJSON(structuredClone(raw)) : null;
  }

  async findByTrackingCode(trackingCode: string): Promise<Shipment | null> {
    const id = this.trackingIndex.get(trackingCode);
    if (!id) return null;
    return this.findById(id);
  }

  async findByIdempotencyKey(key: string): Promise<Shipment | null> {
    const id = this.idempotencyIndex.get(key);
    if (!id) return null;
    return this.findById(id);
  }

  async save(shipment: Shipment): Promise<void> {
    const existing = this.store.get(shipment.id);
    const currentVersion = existing ? existing.version : 0;

    if (currentVersion !== shipment.persistedVersion) {
      throw new ConcurrencyError(
        'shipment',
        shipment.id,
        shipment.persistedVersion,
        currentVersion
      );
    }

    const json = structuredClone(shipment.toJSON());
    this.store.set(shipment.id, json);
    this.trackingIndex.set(shipment.trackingCode, shipment.id);
    if (shipment.idempotencyKey) {
      this.idempotencyIndex.set(shipment.idempotencyKey, shipment.id);
    }
    shipment.markPersisted();
  }

  async findByFilter(filter: ShipmentQueryFilter): Promise<Shipment[]> {
    const results: Shipment[] = [];
    for (const raw of this.store.values()) {
      if (filter.statuses && !filter.statuses.includes(raw.status)) continue;
      if (filter.driverId && raw.driverId !== filter.driverId) continue;
      if (filter.routeId && raw.routeId !== filter.routeId) continue;
      if (filter.orderId && raw.orderId !== filter.orderId) continue;
      results.push(Shipment.fromJSON(structuredClone(raw)));
      if (filter.limit && results.length >= filter.limit) break;
    }
    return results;
  }
}

import { generateId } from '@modulos/core-shared';
import {
  DeliveryRouteJSON,
  DeliveryRouteJSONSchema,
  DeliveryRouteStatus,
  LOGISTICS_SCHEMA_VERSION,
  RouteStop,
  RouteStopStatus,
  parseOrThrowLogisticsInput,
} from '../../schemas/logistics-schemas.js';
import {
  InvalidLogisticsInputError,
  InvalidRouteStateError,
} from '../errors/logistics-errors.js';

export interface CreateDeliveryRouteParams {
  id?: string;
  name: string;
  driverId: string;
  shipmentIds?: string[];
  now?: Date;
}

export class DeliveryRoute {
  public readonly id: string;
  public name: string;
  public driverId: string;
  public status: DeliveryRouteStatus;
  public stops: RouteStop[];
  public startedAt?: string;
  public completedAt?: string;
  public version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  public updatedAt: string;

  private constructor(json: DeliveryRouteJSON, persistedVersion: number) {
    this.id = json.id;
    this.name = json.name;
    this.driverId = json.driverId;
    this.status = json.status;
    this.stops = [...json.stops];
    this.startedAt = json.startedAt;
    this.completedAt = json.completedAt;
    this.version = json.version;
    this._persistedVersion = persistedVersion;
    this.createdAt = json.createdAt;
    this.updatedAt = json.updatedAt;
  }

  get persistedVersion(): number {
    return this._persistedVersion;
  }

  markPersisted(): void {
    this._persistedVersion = this.version;
  }

  static create(params: CreateDeliveryRouteParams): DeliveryRoute {
    const now = (params.now ?? new Date()).toISOString();
    const uniqueShipments = Array.from(new Set(params.shipmentIds ?? []));
    const stops: RouteStop[] = uniqueShipments.map((shipmentId, idx) => ({
      sequence: idx + 1,
      shipmentId,
      status: 'PENDING',
    }));

    const candidate: DeliveryRouteJSON = {
      schemaVersion: LOGISTICS_SCHEMA_VERSION,
      id: params.id ?? generateId('rte'),
      name: params.name,
      driverId: params.driverId,
      status: 'PLANNED',
      stops,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const validated = parseOrThrowLogisticsInput(
      DeliveryRouteJSONSchema,
      candidate,
      'delivery route creation'
    );
    return new DeliveryRoute(validated, 0);
  }

  static fromJSON(raw: unknown): DeliveryRoute {
    const validated = parseOrThrowLogisticsInput(
      DeliveryRouteJSONSchema,
      raw,
      'delivery route JSON'
    );
    return new DeliveryRoute(validated, validated.version);
  }

  toJSON(): DeliveryRouteJSON {
    return {
      schemaVersion: LOGISTICS_SCHEMA_VERSION,
      id: this.id,
      name: this.name,
      driverId: this.driverId,
      status: this.status,
      stops: [...this.stops],
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  addStop(shipmentId: string, estimatedArrivalAt?: Date, now: Date = new Date()): void {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED') {
      throw new InvalidRouteStateError(this.id, this.status, 'addStop');
    }
    if (this.stops.some((s) => s.shipmentId === shipmentId)) {
      throw new InvalidLogisticsInputError(
        `Shipment '${shipmentId}' is already in route '${this.id}'.`
      );
    }

    this.stops.push({
      sequence: this.stops.length + 1,
      shipmentId,
      status: 'PENDING',
      estimatedArrivalAt: estimatedArrivalAt?.toISOString(),
    });
    this.bumpVersion(now.toISOString());
  }

  reorderStops(orderedShipmentIds: ReadonlyArray<string>, now: Date = new Date()): void {
    if (this.status !== 'PLANNED') {
      throw new InvalidRouteStateError(this.id, this.status, 'reorderStops');
    }
    if (orderedShipmentIds.length !== this.stops.length) {
      throw new InvalidLogisticsInputError(
        'orderedShipmentIds must contain the exact same shipments as the route.'
      );
    }

    const stopMap = new Map(this.stops.map((s) => [s.shipmentId, s]));
    const reordered: RouteStop[] = orderedShipmentIds.map((shipmentId, idx) => {
      const existing = stopMap.get(shipmentId);
      if (!existing) {
        throw new InvalidLogisticsInputError(
          `Shipment '${shipmentId}' does not belong to route '${this.id}'.`
        );
      }
      return { ...existing, sequence: idx + 1 };
    });

    this.stops = reordered;
    this.bumpVersion(now.toISOString());
  }

  start(now: Date = new Date()): void {
    if (this.status !== 'PLANNED') {
      throw new InvalidRouteStateError(this.id, this.status, 'start');
    }
    if (this.stops.length === 0) {
      throw new InvalidLogisticsInputError('Cannot start an empty delivery route.');
    }

    const nowIso = now.toISOString();
    this.status = 'IN_PROGRESS';
    this.startedAt = nowIso;
    this.bumpVersion(nowIso);
  }

  markStopStatus(
    shipmentId: string,
    status: RouteStopStatus,
    now: Date = new Date()
  ): void {
    if (this.status !== 'IN_PROGRESS') {
      throw new InvalidRouteStateError(this.id, this.status, 'markStopStatus');
    }

    const idx = this.stops.findIndex((s) => s.shipmentId === shipmentId);
    if (idx === -1) {
      throw new InvalidLogisticsInputError(
        `Shipment '${shipmentId}' not found in route '${this.id}'.`
      );
    }

    const nowIso = now.toISOString();
    this.stops[idx] = {
      ...this.stops[idx],
      status,
      completedAt: status === 'PENDING' ? undefined : nowIso,
    };
    this.bumpVersion(nowIso);
  }

  complete(now: Date = new Date()): void {
    if (this.status !== 'IN_PROGRESS') {
      throw new InvalidRouteStateError(this.id, this.status, 'complete');
    }
    const pendingStop = this.stops.find((s) => s.status === 'PENDING');
    if (pendingStop) {
      throw new InvalidLogisticsInputError(
        `Cannot complete route '${this.id}' while stop '${pendingStop.shipmentId}' is still PENDING.`
      );
    }

    const nowIso = now.toISOString();
    this.status = 'COMPLETED';
    this.completedAt = nowIso;
    this.bumpVersion(nowIso);
  }

  cancel(now: Date = new Date()): void {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED') {
      throw new InvalidRouteStateError(this.id, this.status, 'cancel');
    }
    const nowIso = now.toISOString();
    this.status = 'CANCELLED';
    this.bumpVersion(nowIso);
  }

  private bumpVersion(nowIso: string): void {
    this.version += 1;
    this.updatedAt = nowIso;
  }
}

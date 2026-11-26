import { generateId } from '@modulos/core-shared';
import {
  Coordinates,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  DriverJSON,
  DriverJSONSchema,
  DriverStatus,
  LOGISTICS_SCHEMA_VERSION,
  LogisticsFeatureFlags,
  VehicleType,
  parseOrThrowLogisticsInput,
} from '../../schemas/logistics-schemas.js';
import {
  DriverCapacityExceededError,
  InvalidDriverStateError,
} from '../errors/logistics-errors.js';

export interface CreateDriverParams {
  id?: string;
  name: string;
  phone?: string;
  vehicleType: VehicleType;
  vehiclePlate?: string;
  maxPackages?: number;
  maxWeightGrams?: number;
  currentLocation?: Coordinates;
  now?: Date;
}

export class Driver {
  public readonly id: string;
  public name: string;
  public phone?: string;
  public vehicleType: VehicleType;
  public vehiclePlate?: string;
  public status: DriverStatus;
  public maxPackages?: number;
  public maxWeightGrams?: number;
  public currentLocation?: Coordinates;
  public activeRouteId?: string;
  public version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  public updatedAt: string;

  private constructor(json: DriverJSON, persistedVersion: number) {
    this.id = json.id;
    this.name = json.name;
    this.phone = json.phone;
    this.vehicleType = json.vehicleType;
    this.vehiclePlate = json.vehiclePlate;
    this.status = json.status;
    this.maxPackages = json.maxPackages;
    this.maxWeightGrams = json.maxWeightGrams;
    this.currentLocation = json.currentLocation;
    this.activeRouteId = json.activeRouteId;
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

  static create(params: CreateDriverParams): Driver {
    const now = (params.now ?? new Date()).toISOString();
    const candidate: DriverJSON = {
      schemaVersion: LOGISTICS_SCHEMA_VERSION,
      id: params.id ?? generateId('drv'),
      name: params.name,
      phone: params.phone,
      vehicleType: params.vehicleType,
      vehiclePlate: params.vehiclePlate,
      status: 'AVAILABLE',
      maxPackages: params.maxPackages,
      maxWeightGrams: params.maxWeightGrams,
      currentLocation: params.currentLocation,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const validated = parseOrThrowLogisticsInput(DriverJSONSchema, candidate, 'driver creation');
    return new Driver(validated, 0);
  }

  static fromJSON(raw: unknown): Driver {
    const validated = parseOrThrowLogisticsInput(DriverJSONSchema, raw, 'driver JSON');
    return new Driver(validated, validated.version);
  }

  toJSON(): DriverJSON {
    return {
      schemaVersion: LOGISTICS_SCHEMA_VERSION,
      id: this.id,
      name: this.name,
      phone: this.phone,
      vehicleType: this.vehicleType,
      vehiclePlate: this.vehiclePlate,
      status: this.status,
      maxPackages: this.maxPackages,
      maxWeightGrams: this.maxWeightGrams,
      currentLocation: this.currentLocation,
      activeRouteId: this.activeRouteId,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  assertCanAcceptLoad(
    packagesCount: number,
    weightGrams: number,
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): void {
    if (this.status === 'OFFLINE') {
      throw new InvalidDriverStateError(this.id, this.status, 'accept shipment or route');
    }

    if (!flags.enforceDriverCapacity) {
      return;
    }

    if (this.maxPackages !== undefined && packagesCount > this.maxPackages) {
      throw new DriverCapacityExceededError(
        this.id,
        `requested ${packagesCount} packages, max allowed is ${this.maxPackages}.`
      );
    }

    if (this.maxWeightGrams !== undefined && weightGrams > this.maxWeightGrams) {
      throw new DriverCapacityExceededError(
        this.id,
        `requested ${weightGrams}g, max allowed is ${this.maxWeightGrams}g.`
      );
    }
  }

  assignRoute(routeId: string, now: Date = new Date()): void {
    if (this.status === 'OFFLINE') {
      throw new InvalidDriverStateError(this.id, this.status, 'assignRoute');
    }
    this.activeRouteId = routeId;
    this.status = 'ON_ROUTE';
    this.bumpVersion(now.toISOString());
  }

  releaseFromRoute(now: Date = new Date()): void {
    this.activeRouteId = undefined;
    if (this.status === 'ON_ROUTE') {
      this.status = 'AVAILABLE';
    }
    this.bumpVersion(now.toISOString());
  }

  setStatus(status: DriverStatus, now: Date = new Date()): void {
    if (status === 'OFFLINE' && this.activeRouteId) {
      throw new InvalidDriverStateError(
        this.id,
        this.status,
        'go OFFLINE while assigned to an active route'
      );
    }
    this.status = status;
    this.bumpVersion(now.toISOString());
  }

  updateLocation(location: Coordinates, now: Date = new Date()): void {
    this.currentLocation = location;
    this.bumpVersion(now.toISOString());
  }

  private bumpVersion(nowIso: string): void {
    this.version += 1;
    this.updatedAt = nowIso;
  }
}

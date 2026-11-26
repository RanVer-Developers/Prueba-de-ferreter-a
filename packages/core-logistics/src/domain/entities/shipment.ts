import { Money, generateId } from '@modulos/core-shared';
import {
  ActorSummary,
  Address,
  Coordinates,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  DeliveryAttempt,
  DeliveryFailureReason,
  LOGISTICS_SCHEMA_VERSION,
  LogisticsFeatureFlags,
  PackageSpec,
  ProofOfDelivery,
  ShipmentJSON,
  ShipmentJSONSchema,
  ShipmentStatus,
  TrackingEvent,
  parseOrThrowLogisticsInput,
} from '../../schemas/logistics-schemas.js';
import {
  InvalidDeliveryPinError,
  InvalidLogisticsInputError,
  InvalidShipmentStateError,
  MaxDeliveryAttemptsExceededError,
  ProofOfDeliveryRequiredError,
} from '../errors/logistics-errors.js';
import {
  assertValidShipmentTransition,
  isTerminalShipmentStatus,
} from '../services/shipment-state-machine.js';

export interface CreateShipmentParams {
  id?: string;
  trackingCode?: string;
  orderId?: string;
  idempotencyKey?: string;
  origin: Address;
  destination: Address;
  packages: PackageSpec[];
  shippingFee: Money;
  deliveryPin?: string;
  scheduledWindowStart?: Date;
  scheduledWindowEnd?: Date;
  notes?: string;
  metadata?: Record<string, unknown>;
  actor?: ActorSummary;
  now?: Date;
}

export interface CompleteDeliveryParams {
  receivedBy: string;
  signatureRef?: string;
  photoRef?: string;
  pin?: string;
  notes?: string;
  location?: Coordinates;
  actor?: ActorSummary;
  now?: Date;
}

export interface RecordFailedAttemptParams {
  reason: DeliveryFailureReason;
  driverId?: string;
  note?: string;
  location?: Coordinates;
  actor?: ActorSummary;
  now?: Date;
}

export class Shipment {
  public readonly id: string;
  public readonly trackingCode: string;
  public readonly orderId?: string;
  public readonly idempotencyKey?: string;
  public status: ShipmentStatus;
  public readonly origin: Address;
  public readonly destination: Address;
  public readonly packages: ReadonlyArray<PackageSpec>;
  public readonly shippingFee: Money;
  public driverId?: string;
  public routeId?: string;
  public deliveryPin?: string;
  public scheduledWindowStart?: string;
  public scheduledWindowEnd?: string;
  public trackingEvents: TrackingEvent[];
  public deliveryAttempts: DeliveryAttempt[];
  public proofOfDelivery?: ProofOfDelivery;
  public notes?: string;
  public metadata?: Record<string, unknown>;
  public version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  public updatedAt: string;

  private constructor(json: ShipmentJSON, persistedVersion: number) {
    this.id = json.id;
    this.trackingCode = json.trackingCode;
    this.orderId = json.orderId;
    this.idempotencyKey = json.idempotencyKey;
    this.status = json.status;
    this.origin = json.origin;
    this.destination = json.destination;
    this.packages = json.packages;
    this.shippingFee = Money.fromJSON(json.shippingFee);
    this.driverId = json.driverId;
    this.routeId = json.routeId;
    this.deliveryPin = json.deliveryPin;
    this.scheduledWindowStart = json.scheduledWindowStart;
    this.scheduledWindowEnd = json.scheduledWindowEnd;
    this.trackingEvents = [...json.trackingEvents];
    this.deliveryAttempts = [...json.deliveryAttempts];
    this.proofOfDelivery = json.proofOfDelivery;
    this.notes = json.notes;
    this.metadata = json.metadata ? { ...json.metadata } : undefined;
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

  get totalPackagesCount(): number {
    return this.packages.reduce((acc, p) => acc + p.quantity, 0);
  }

  get totalWeightGrams(): number {
    return this.packages.reduce((acc, p) => acc + p.weightGrams * p.quantity, 0);
  }

  static create(params: CreateShipmentParams): Shipment {
    const now = (params.now ?? new Date()).toISOString();
    const id = params.id ?? generateId('shp');
    const trackingCode =
      params.trackingCode ?? `TRK-${id.slice(-8).toUpperCase()}`;

    if (
      params.scheduledWindowStart &&
      params.scheduledWindowEnd &&
      params.scheduledWindowStart.getTime() > params.scheduledWindowEnd.getTime()
    ) {
      throw new InvalidLogisticsInputError(
        'scheduledWindowStart cannot be after scheduledWindowEnd.'
      );
    }

    const candidate: ShipmentJSON = {
      schemaVersion: LOGISTICS_SCHEMA_VERSION,
      id,
      trackingCode,
      orderId: params.orderId,
      idempotencyKey: params.idempotencyKey,
      status: 'PENDING',
      origin: params.origin,
      destination: params.destination,
      packages: params.packages,
      shippingFee: params.shippingFee.toJSON(),
      deliveryPin: params.deliveryPin,
      scheduledWindowStart: params.scheduledWindowStart?.toISOString(),
      scheduledWindowEnd: params.scheduledWindowEnd?.toISOString(),
      trackingEvents: [
        {
          id: generateId('trk'),
          status: 'PENDING',
          occurredAt: now,
          actor: params.actor,
          note: 'Shipment created',
        },
      ],
      deliveryAttempts: [],
      notes: params.notes,
      metadata: params.metadata,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const validated = parseOrThrowLogisticsInput(
      ShipmentJSONSchema,
      candidate,
      'shipment creation'
    );
    return new Shipment(validated, 0);
  }

  static fromJSON(raw: unknown): Shipment {
    const validated = parseOrThrowLogisticsInput(ShipmentJSONSchema, raw, 'shipment JSON');
    return new Shipment(validated, validated.version);
  }

  toJSON(): ShipmentJSON {
    return {
      schemaVersion: LOGISTICS_SCHEMA_VERSION,
      id: this.id,
      trackingCode: this.trackingCode,
      orderId: this.orderId,
      idempotencyKey: this.idempotencyKey,
      status: this.status,
      origin: this.origin,
      destination: this.destination,
      packages: [...this.packages],
      shippingFee: this.shippingFee.toJSON(),
      driverId: this.driverId,
      routeId: this.routeId,
      deliveryPin: this.deliveryPin,
      scheduledWindowStart: this.scheduledWindowStart,
      scheduledWindowEnd: this.scheduledWindowEnd,
      trackingEvents: [...this.trackingEvents],
      deliveryAttempts: [...this.deliveryAttempts],
      proofOfDelivery: this.proofOfDelivery,
      notes: this.notes,
      metadata: this.metadata ? { ...this.metadata } : undefined,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  assignDriver(
    driverId: string,
    options: {
      routeId?: string;
      actor?: ActorSummary;
      note?: string;
      now?: Date;
    } = {},
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): void {
    if (!driverId.trim()) {
      throw new InvalidLogisticsInputError('driverId cannot be empty.');
    }

    if (this.status !== 'ASSIGNED') {
      assertValidShipmentTransition(this.id, this.status, 'ASSIGNED', flags);
    }

    const now = (options.now ?? new Date()).toISOString();
    this.driverId = driverId;
    if (options.routeId !== undefined) {
      this.routeId = options.routeId;
    }
    this.status = 'ASSIGNED';
    this.trackingEvents.push({
      id: generateId('trk'),
      status: 'ASSIGNED',
      occurredAt: now,
      actor: options.actor,
      note: options.note ?? `Assigned to driver '${driverId}'`,
    });
    this.bumpVersion(now);
  }

  unassignDriver(
    options: { actor?: ActorSummary; note?: string; now?: Date } = {},
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): void {
    assertValidShipmentTransition(this.id, this.status, 'PENDING', flags);
    const now = (options.now ?? new Date()).toISOString();
    this.driverId = undefined;
    this.routeId = undefined;
    this.status = 'PENDING';
    this.trackingEvents.push({
      id: generateId('trk'),
      status: 'PENDING',
      occurredAt: now,
      actor: options.actor,
      note: options.note ?? 'Driver unassigned',
    });
    this.bumpVersion(now);
  }

  transitionStatus(
    targetStatus: ShipmentStatus,
    options: {
      actor?: ActorSummary;
      note?: string;
      location?: Coordinates;
      now?: Date;
    } = {},
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): void {
    if (targetStatus === 'DELIVERED') {
      throw new InvalidShipmentStateError(
        this.id,
        this.status,
        'DELIVERED (use completeDelivery() to provide proof of delivery)'
      );
    }

    assertValidShipmentTransition(this.id, this.status, targetStatus, flags);
    const now = (options.now ?? new Date()).toISOString();
    this.status = targetStatus;
    this.trackingEvents.push({
      id: generateId('trk'),
      status: targetStatus,
      occurredAt: now,
      actor: options.actor,
      location: options.location,
      note: options.note,
    });
    this.bumpVersion(now);
  }

  recordFailedAttempt(
    params: RecordFailedAttemptParams,
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): DeliveryAttempt {
    if (isTerminalShipmentStatus(this.status)) {
      throw new InvalidShipmentStateError(this.id, this.status, 'FAILED');
    }

    if (this.deliveryAttempts.length >= flags.maxDeliveryAttempts) {
      throw new MaxDeliveryAttemptsExceededError(this.id, flags.maxDeliveryAttempts);
    }

    if (this.status !== 'FAILED') {
      assertValidShipmentTransition(this.id, this.status, 'FAILED', flags);
    }

    const now = (params.now ?? new Date()).toISOString();
    const attempt: DeliveryAttempt = {
      attemptNumber: this.deliveryAttempts.length + 1,
      occurredAt: now,
      driverId: params.driverId ?? this.driverId,
      reason: params.reason,
      note: params.note,
      location: params.location,
    };

    this.deliveryAttempts.push(attempt);
    this.status = 'FAILED';
    this.trackingEvents.push({
      id: generateId('trk'),
      status: 'FAILED',
      occurredAt: now,
      actor: params.actor,
      location: params.location,
      note: params.note,
      failureReason: params.reason,
    });
    this.bumpVersion(now);

    return attempt;
  }

  completeDelivery(
    params: CompleteDeliveryParams,
    flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS
  ): ProofOfDelivery {
    assertValidShipmentTransition(this.id, this.status, 'DELIVERED', flags);

    if (!params.receivedBy || !params.receivedBy.trim()) {
      throw new ProofOfDeliveryRequiredError(this.id, 'receivedBy is required.');
    }

    if (flags.requireProofOfDelivery && !params.signatureRef && !params.photoRef) {
      throw new ProofOfDeliveryRequiredError(
        this.id,
        'signatureRef or photoRef is required when requireProofOfDelivery is enabled.'
      );
    }

    let pinVerified = false;
    if (flags.requireDeliveryPin) {
      if (!this.deliveryPin) {
        throw new InvalidDeliveryPinError(this.id);
      }
      if (!params.pin || params.pin !== this.deliveryPin) {
        throw new InvalidDeliveryPinError(this.id);
      }
      pinVerified = true;
    } else if (this.deliveryPin && params.pin) {
      if (params.pin !== this.deliveryPin) {
        throw new InvalidDeliveryPinError(this.id);
      }
      pinVerified = true;
    }

    const now = (params.now ?? new Date()).toISOString();
    const pod: ProofOfDelivery = {
      deliveredAt: now,
      receivedBy: params.receivedBy.trim(),
      signatureRef: params.signatureRef,
      photoRef: params.photoRef,
      pinVerified,
      notes: params.notes,
      location: params.location,
    };

    this.proofOfDelivery = pod;
    this.status = 'DELIVERED';
    this.trackingEvents.push({
      id: generateId('trk'),
      status: 'DELIVERED',
      occurredAt: now,
      actor: params.actor,
      location: params.location,
      note: params.notes ?? `Delivered to ${pod.receivedBy}`,
    });
    this.bumpVersion(now);

    return pod;
  }

  private bumpVersion(nowIso: string): void {
    this.version += 1;
    this.updatedAt = nowIso;
  }
}

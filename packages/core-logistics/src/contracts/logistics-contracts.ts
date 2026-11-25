import { DeliveryRoute } from '../domain/entities/delivery-route.js';
import { Driver } from '../domain/entities/driver.js';
import { Shipment } from '../domain/entities/shipment.js';
import { LogisticsDomainEvent } from '../domain/events/logistics-events.js';
import {
  DeliveryRouteStatus,
  DriverStatus,
  ShipmentStatus,
  ShippingRateRule,
} from '../schemas/logistics-schemas.js';

export interface ShipmentQueryFilter {
  statuses?: ShipmentStatus[];
  driverId?: string;
  routeId?: string;
  orderId?: string;
  limit?: number;
}

export interface IShipmentRepository {
  findById(id: string): Promise<Shipment | null>;
  findByTrackingCode(trackingCode: string): Promise<Shipment | null>;
  findByIdempotencyKey(key: string): Promise<Shipment | null>;
  save(shipment: Shipment): Promise<void>;
  findByFilter?(filter: ShipmentQueryFilter): Promise<Shipment[]>;
}

export interface IDriverRepository {
  findById(id: string): Promise<Driver | null>;
  findByStatus?(status: DriverStatus): Promise<Driver[]>;
  save(driver: Driver): Promise<void>;
}

export interface IDeliveryRouteRepository {
  findById(id: string): Promise<DeliveryRoute | null>;
  findByDriverId?(driverId: string, status?: DeliveryRouteStatus): Promise<DeliveryRoute[]>;
  save(route: DeliveryRoute): Promise<void>;
}

export interface IShippingRateCatalog {
  findById(ruleId: string): Promise<ShippingRateRule | null>;
  listActive?(): Promise<ShippingRateRule[]>;
}

export interface IClock {
  now(): Date;
}

export const SystemClock: IClock = {
  now: () => new Date(),
};

export type LogisticsEventPublisher = (event: LogisticsDomainEvent) => Promise<void> | void;

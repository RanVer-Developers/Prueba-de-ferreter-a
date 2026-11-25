import {
  IClock,
  IDeliveryRouteRepository,
  IDriverRepository,
  IShipmentRepository,
  LogisticsEventPublisher,
  SystemClock,
} from '../contracts/logistics-contracts.js';
import { DeliveryRoute } from '../domain/entities/delivery-route.js';
import { Shipment } from '../domain/entities/shipment.js';
import {
  DriverNotFoundError,
  RouteNotFoundError,
  ShipmentNotFoundError,
} from '../domain/errors/logistics-errors.js';
import {
  RouteCreatedEvent,
  RouteStatusChangedEvent,
} from '../domain/events/logistics-events.js';
import {
  ActorSummary,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
  RouteStopStatus,
} from '../schemas/logistics-schemas.js';

export interface CreateDeliveryRouteInput {
  id?: string;
  name: string;
  driverId: string;
  shipmentIds: string[];
  actor?: ActorSummary;
}

export class ManageDeliveryRouteUseCase {
  constructor(
    private readonly routeRepo: IDeliveryRouteRepository,
    private readonly driverRepo: IDriverRepository,
    private readonly shipmentRepo: IShipmentRepository,
    private readonly flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS,
    private readonly clock: IClock = SystemClock,
    private readonly publishEvent?: LogisticsEventPublisher
  ) {}

  async createRoute(input: CreateDeliveryRouteInput): Promise<DeliveryRoute> {
    const driver = await this.driverRepo.findById(input.driverId);
    if (!driver) {
      throw new DriverNotFoundError(input.driverId);
    }

    const shipments: Shipment[] = [];
    let totalPackages = 0;
    let totalWeightGrams = 0;

    for (const shipmentId of input.shipmentIds) {
      const shipment = await this.shipmentRepo.findById(shipmentId);
      if (!shipment) {
        throw new ShipmentNotFoundError(shipmentId);
      }
      shipments.push(shipment);
      totalPackages += shipment.totalPackagesCount;
      totalWeightGrams += shipment.totalWeightGrams;
    }

    driver.assertCanAcceptLoad(totalPackages, totalWeightGrams, this.flags);

    const now = this.clock.now();
    const route = DeliveryRoute.create({
      id: input.id,
      name: input.name,
      driverId: driver.id,
      shipmentIds: input.shipmentIds,
      now,
    });

    for (const shipment of shipments) {
      shipment.assignDriver(
        driver.id,
        { routeId: route.id, actor: input.actor, now },
        this.flags
      );
      await this.shipmentRepo.save(shipment);
    }

    await this.routeRepo.save(route);

    if (this.publishEvent) {
      await this.publishEvent(
        new RouteCreatedEvent(route.id, driver.id, route.stops.length, now)
      );
    }

    return route;
  }

  async startRoute(routeId: string): Promise<DeliveryRoute> {
    const route = await this.routeRepo.findById(routeId);
    if (!route) {
      throw new RouteNotFoundError(routeId);
    }

    const driver = await this.driverRepo.findById(route.driverId);
    if (!driver) {
      throw new DriverNotFoundError(route.driverId);
    }

    const previousStatus = route.status;
    const now = this.clock.now();

    route.start(now);
    driver.assignRoute(route.id, now);

    await this.driverRepo.save(driver);
    await this.routeRepo.save(route);

    if (this.publishEvent) {
      await this.publishEvent(
        new RouteStatusChangedEvent(route.id, previousStatus, route.status, now)
      );
    }

    return route;
  }

  async updateStopStatus(
    routeId: string,
    shipmentId: string,
    status: RouteStopStatus
  ): Promise<DeliveryRoute> {
    const route = await this.routeRepo.findById(routeId);
    if (!route) {
      throw new RouteNotFoundError(routeId);
    }

    route.markStopStatus(shipmentId, status, this.clock.now());
    await this.routeRepo.save(route);
    return route;
  }

  async completeRoute(routeId: string): Promise<DeliveryRoute> {
    const route = await this.routeRepo.findById(routeId);
    if (!route) {
      throw new RouteNotFoundError(routeId);
    }

    const driver = await this.driverRepo.findById(route.driverId);
    if (!driver) {
      throw new DriverNotFoundError(route.driverId);
    }

    const previousStatus = route.status;
    const now = this.clock.now();

    route.complete(now);
    driver.releaseFromRoute(now);

    await this.driverRepo.save(driver);
    await this.routeRepo.save(route);

    if (this.publishEvent) {
      await this.publishEvent(
        new RouteStatusChangedEvent(route.id, previousStatus, route.status, now)
      );
    }

    return route;
  }
}

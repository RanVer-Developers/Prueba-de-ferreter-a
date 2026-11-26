import {
  IClock,
  IDriverRepository,
  IShipmentRepository,
  LogisticsEventPublisher,
  SystemClock,
} from '../contracts/logistics-contracts.js';
import { Shipment } from '../domain/entities/shipment.js';
import {
  DriverNotFoundError,
  ShipmentNotFoundError,
} from '../domain/errors/logistics-errors.js';
import { ShipmentAssignedEvent } from '../domain/events/logistics-events.js';
import {
  ActorSummary,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
} from '../schemas/logistics-schemas.js';

export interface AssignDriverInput {
  shipmentId: string;
  driverId: string;
  routeId?: string;
  actor?: ActorSummary;
  note?: string;
}

export class AssignDriverUseCase {
  constructor(
    private readonly shipmentRepo: IShipmentRepository,
    private readonly driverRepo: IDriverRepository,
    private readonly flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS,
    private readonly clock: IClock = SystemClock,
    private readonly publishEvent?: LogisticsEventPublisher
  ) {}

  async execute(input: AssignDriverInput): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findById(input.shipmentId);
    if (!shipment) {
      throw new ShipmentNotFoundError(input.shipmentId);
    }

    const driver = await this.driverRepo.findById(input.driverId);
    if (!driver) {
      throw new DriverNotFoundError(input.driverId);
    }

    driver.assertCanAcceptLoad(
      shipment.totalPackagesCount,
      shipment.totalWeightGrams,
      this.flags
    );

    const now = this.clock.now();
    shipment.assignDriver(
      driver.id,
      {
        routeId: input.routeId,
        actor: input.actor,
        note: input.note,
        now,
      },
      this.flags
    );

    await this.shipmentRepo.save(shipment);

    if (this.publishEvent) {
      await this.publishEvent(
        new ShipmentAssignedEvent(shipment.id, driver.id, input.routeId, input.actor, now)
      );
    }

    return shipment;
  }
}

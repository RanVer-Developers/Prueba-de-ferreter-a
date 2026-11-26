import {
  IClock,
  IShipmentRepository,
  LogisticsEventPublisher,
  SystemClock,
} from '../contracts/logistics-contracts.js';
import { Shipment } from '../domain/entities/shipment.js';
import { ShipmentNotFoundError } from '../domain/errors/logistics-errors.js';
import { ShipmentStatusChangedEvent } from '../domain/events/logistics-events.js';
import {
  ActorSummary,
  Coordinates,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
  ShipmentStatus,
} from '../schemas/logistics-schemas.js';

export interface TransitionShipmentStatusInput {
  shipmentId: string;
  targetStatus: ShipmentStatus;
  actor?: ActorSummary;
  note?: string;
  location?: Coordinates;
}

export class TransitionShipmentStatusUseCase {
  constructor(
    private readonly shipmentRepo: IShipmentRepository,
    private readonly flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS,
    private readonly clock: IClock = SystemClock,
    private readonly publishEvent?: LogisticsEventPublisher
  ) {}

  async execute(input: TransitionShipmentStatusInput): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findById(input.shipmentId);
    if (!shipment) {
      throw new ShipmentNotFoundError(input.shipmentId);
    }

    const previousStatus = shipment.status;
    const now = this.clock.now();

    shipment.transitionStatus(
      input.targetStatus,
      {
        actor: input.actor,
        note: input.note,
        location: input.location,
        now,
      },
      this.flags
    );

    await this.shipmentRepo.save(shipment);

    if (this.publishEvent) {
      await this.publishEvent(
        new ShipmentStatusChangedEvent(
          shipment.id,
          previousStatus,
          shipment.status,
          input.actor,
          input.note,
          now
        )
      );
    }

    return shipment;
  }
}

import {
  IClock,
  IShipmentRepository,
  LogisticsEventPublisher,
  SystemClock,
} from '../contracts/logistics-contracts.js';
import { Shipment } from '../domain/entities/shipment.js';
import { ShipmentNotFoundError } from '../domain/errors/logistics-errors.js';
import { DeliveryAttemptFailedEvent } from '../domain/events/logistics-events.js';
import {
  ActorSummary,
  Coordinates,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  DeliveryFailureReason,
  LogisticsFeatureFlags,
} from '../schemas/logistics-schemas.js';

export interface RecordDeliveryAttemptInput {
  shipmentId: string;
  reason: DeliveryFailureReason;
  driverId?: string;
  note?: string;
  location?: Coordinates;
  actor?: ActorSummary;
}

export class RecordDeliveryAttemptUseCase {
  constructor(
    private readonly shipmentRepo: IShipmentRepository,
    private readonly flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS,
    private readonly clock: IClock = SystemClock,
    private readonly publishEvent?: LogisticsEventPublisher
  ) {}

  async execute(input: RecordDeliveryAttemptInput): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findById(input.shipmentId);
    if (!shipment) {
      throw new ShipmentNotFoundError(input.shipmentId);
    }

    const now = this.clock.now();
    const attempt = shipment.recordFailedAttempt(
      {
        reason: input.reason,
        driverId: input.driverId,
        note: input.note,
        location: input.location,
        actor: input.actor,
        now,
      },
      this.flags
    );

    await this.shipmentRepo.save(shipment);

    if (this.publishEvent) {
      await this.publishEvent(
        new DeliveryAttemptFailedEvent(
          shipment.id,
          attempt.attemptNumber,
          attempt.reason,
          attempt.driverId,
          now
        )
      );
    }

    return shipment;
  }
}

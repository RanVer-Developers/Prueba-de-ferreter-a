import {
  IClock,
  IShipmentRepository,
  LogisticsEventPublisher,
  SystemClock,
} from '../contracts/logistics-contracts.js';
import { Shipment } from '../domain/entities/shipment.js';
import { ShipmentNotFoundError } from '../domain/errors/logistics-errors.js';
import { ShipmentDeliveredEvent } from '../domain/events/logistics-events.js';
import {
  ActorSummary,
  Coordinates,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  LogisticsFeatureFlags,
} from '../schemas/logistics-schemas.js';

export interface CompleteDeliveryInput {
  shipmentId: string;
  receivedBy: string;
  signatureRef?: string;
  photoRef?: string;
  pin?: string;
  notes?: string;
  location?: Coordinates;
  actor?: ActorSummary;
}

export class CompleteDeliveryUseCase {
  constructor(
    private readonly shipmentRepo: IShipmentRepository,
    private readonly flags: LogisticsFeatureFlags = DEFAULT_LOGISTICS_FEATURE_FLAGS,
    private readonly clock: IClock = SystemClock,
    private readonly publishEvent?: LogisticsEventPublisher
  ) {}

  async execute(input: CompleteDeliveryInput): Promise<Shipment> {
    const shipment = await this.shipmentRepo.findById(input.shipmentId);
    if (!shipment) {
      throw new ShipmentNotFoundError(input.shipmentId);
    }

    const now = this.clock.now();
    const pod = shipment.completeDelivery(
      {
        receivedBy: input.receivedBy,
        signatureRef: input.signatureRef,
        photoRef: input.photoRef,
        pin: input.pin,
        notes: input.notes,
        location: input.location,
        actor: input.actor,
        now,
      },
      this.flags
    );

    await this.shipmentRepo.save(shipment);

    if (this.publishEvent) {
      await this.publishEvent(
        new ShipmentDeliveredEvent(shipment.id, pod, shipment.driverId, now)
      );
    }

    return shipment;
  }
}

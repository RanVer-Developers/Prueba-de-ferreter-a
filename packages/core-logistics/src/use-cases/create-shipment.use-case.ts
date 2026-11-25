import { Money } from '@modulos/core-shared';
import {
  IClock,
  IShipmentRepository,
  LogisticsEventPublisher,
  SystemClock,
} from '../contracts/logistics-contracts.js';
import { Shipment } from '../domain/entities/shipment.js';
import { ShipmentCreatedEvent } from '../domain/events/logistics-events.js';
import {
  ActorSummary,
  Address,
  AddressSchema,
  PackageSpec,
  PackageSpecSchema,
  PositiveMoneyJSONSchema,
  parseOrThrowLogisticsInput,
} from '../schemas/logistics-schemas.js';
import { z } from 'zod';

const CreateShipmentInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  trackingCode: z.string().trim().min(1).optional(),
  orderId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSpecSchema).min(1),
  shippingFee: PositiveMoneyJSONSchema,
  deliveryPin: z.string().trim().min(4).max(12).optional(),
  scheduledWindowStart: z.date().optional(),
  scheduledWindowEnd: z.date().optional(),
  notes: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  actor: z
    .object({
      id: z.string().trim().min(1),
      name: z.string().trim().min(1),
      role: z.string().trim().min(1).optional(),
    })
    .optional(),
});

export interface CreateShipmentInput {
  id?: string;
  trackingCode?: string;
  orderId?: string;
  idempotencyKey?: string;
  origin: Address;
  destination: Address;
  packages: PackageSpec[];
  shippingFee: { cents: number; currency: string };
  deliveryPin?: string;
  scheduledWindowStart?: Date;
  scheduledWindowEnd?: Date;
  notes?: string;
  metadata?: Record<string, unknown>;
  actor?: ActorSummary;
}

export class CreateShipmentUseCase {
  constructor(
    private readonly shipmentRepo: IShipmentRepository,
    private readonly clock: IClock = SystemClock,
    private readonly publishEvent?: LogisticsEventPublisher
  ) {}

  async execute(rawInput: CreateShipmentInput): Promise<Shipment> {
    const input = parseOrThrowLogisticsInput(
      CreateShipmentInputSchema,
      rawInput,
      'create shipment input'
    );

    if (input.idempotencyKey) {
      const existing = await this.shipmentRepo.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const now = this.clock.now();
    const shipment = Shipment.create({
      ...input,
      shippingFee: Money.fromJSON(input.shippingFee),
      now,
    });

    await this.shipmentRepo.save(shipment);

    if (this.publishEvent) {
      await this.publishEvent(
        new ShipmentCreatedEvent(shipment.id, shipment.trackingCode, shipment.orderId, now)
      );
    }

    return shipment;
  }
}

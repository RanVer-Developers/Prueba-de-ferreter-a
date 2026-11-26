import { z } from 'zod';
import {
  IsoCurrencyCodeSchema,
  IsoDateTimeSchema,
  MoneyJSONSchema,
  NonEmptyStringSchema,
} from '@modulos/core-shared';
import { InvalidLogisticsInputError } from '../domain/errors/logistics-errors.js';

export const LOGISTICS_SCHEMA_VERSION = 1 as const;

export const PositiveMoneyJSONSchema = MoneyJSONSchema.refine(
  (m) => m.cents >= 0,
  'Monetary amount cannot be negative.'
);

export const ActorSummarySchema = z.object({
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  role: z.string().trim().min(1).optional(),
});
export type ActorSummary = z.infer<typeof ActorSummarySchema>;

// ---------------------------------------------------------------------------
// Addresses & Packages
// ---------------------------------------------------------------------------

export const CoordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const AddressSchema = z.object({
  recipientName: NonEmptyStringSchema,
  phone: z.string().trim().min(1).optional(),
  street: NonEmptyStringSchema,
  neighborhood: z.string().trim().min(1).optional(),
  city: NonEmptyStringSchema,
  state: z.string().trim().min(1).optional(),
  postalCode: z.string().trim().min(1).optional(),
  country: z.string().trim().min(2).max(3).default('MX'),
  reference: z.string().trim().min(1).optional(),
  zoneCode: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  coordinates: CoordinatesSchema.optional(),
});
export type Address = z.infer<typeof AddressSchema>;

export const PackageDimensionsCmSchema = z.object({
  lengthCm: z.number().finite().positive(),
  widthCm: z.number().finite().positive(),
  heightCm: z.number().finite().positive(),
});
export type PackageDimensionsCm = z.infer<typeof PackageDimensionsCmSchema>;

export const PackageSpecSchema = z.object({
  id: NonEmptyStringSchema,
  description: z.string().trim().min(1).optional(),
  weightGrams: z.number().int().positive('Weight must be positive in grams.'),
  quantity: z.number().int().positive().default(1),
  dimensionsCm: PackageDimensionsCmSchema.optional(),
  declaredValueCents: z.number().int().nonnegative().optional(),
  fragile: z.boolean().default(false),
});
export type PackageSpec = z.infer<typeof PackageSpecSchema>;

// ---------------------------------------------------------------------------
// Shipment Statuses & Tracking
// ---------------------------------------------------------------------------

export const ShipmentStatusSchema = z.enum([
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'RETURNED',
  'CANCELLED',
]);
export type ShipmentStatus = z.infer<typeof ShipmentStatusSchema>;

export const DeliveryFailureReasonSchema = z.enum([
  'RECIPIENT_ABSENT',
  'WRONG_ADDRESS',
  'REFUSED_BY_RECIPIENT',
  'DAMAGED_IN_TRANSIT',
  'ACCESS_DENIED',
  'RESCHEDULED',
  'OTHER',
]);
export type DeliveryFailureReason = z.infer<typeof DeliveryFailureReasonSchema>;

export const TrackingEventSchema = z.object({
  id: NonEmptyStringSchema,
  status: ShipmentStatusSchema,
  occurredAt: IsoDateTimeSchema,
  actor: ActorSummarySchema.optional(),
  location: CoordinatesSchema.optional(),
  note: z.string().trim().min(1).optional(),
  failureReason: DeliveryFailureReasonSchema.optional(),
});
export type TrackingEvent = z.infer<typeof TrackingEventSchema>;

export const DeliveryAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  occurredAt: IsoDateTimeSchema,
  driverId: NonEmptyStringSchema.optional(),
  reason: DeliveryFailureReasonSchema,
  note: z.string().trim().min(1).optional(),
  location: CoordinatesSchema.optional(),
});
export type DeliveryAttempt = z.infer<typeof DeliveryAttemptSchema>;

export const ProofOfDeliverySchema = z.object({
  deliveredAt: IsoDateTimeSchema,
  receivedBy: NonEmptyStringSchema,
  signatureRef: z.string().trim().min(1).optional(),
  photoRef: z.string().trim().min(1).optional(),
  pinVerified: z.boolean().default(false),
  notes: z.string().trim().min(1).optional(),
  location: CoordinatesSchema.optional(),
});
export type ProofOfDelivery = z.infer<typeof ProofOfDeliverySchema>;

// ---------------------------------------------------------------------------
// Shipping Rates
// ---------------------------------------------------------------------------

export const ShippingRateStrategySchema = z.enum(['FLAT', 'ZONE', 'DISTANCE', 'WEIGHT']);
export type ShippingRateStrategy = z.infer<typeof ShippingRateStrategySchema>;

export const ZoneRateEntrySchema = z.object({
  zoneCode: NonEmptyStringSchema.transform((s) => s.toUpperCase()),
  feeCents: z.number().int().nonnegative(),
});
export type ZoneRateEntry = z.infer<typeof ZoneRateEntrySchema>;

export const WeightTierSchema = z.object({
  maxWeightGrams: z.number().int().positive(),
  feeCents: z.number().int().nonnegative(),
});
export type WeightTier = z.infer<typeof WeightTierSchema>;

export const ShippingRateRuleSchema = z.object({
  schemaVersion: z.literal(LOGISTICS_SCHEMA_VERSION).default(LOGISTICS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  currency: IsoCurrencyCodeSchema,
  strategy: ShippingRateStrategySchema,
  baseFeeCents: z.number().int().nonnegative().default(0),
  perKmCents: z.number().int().nonnegative().optional(),
  includedKm: z.number().finite().nonnegative().default(0),
  zoneRates: z.array(ZoneRateEntrySchema).optional(),
  weightTiers: z.array(WeightTierSchema).optional(),
  extraKgCents: z.number().int().nonnegative().optional(),
  freeShippingThresholdCents: z.number().int().nonnegative().optional(),
  volumetricDivisor: z.number().int().positive().default(5000),
  active: z.boolean().default(true),
});
export type ShippingRateRule = z.infer<typeof ShippingRateRuleSchema>;

export const QuoteShippingInputSchema = z.object({
  currency: IsoCurrencyCodeSchema,
  orderSubtotalCents: z.number().int().nonnegative().default(0),
  zoneCode: z.string().trim().min(1).transform((s) => s.toUpperCase()).optional(),
  distanceKm: z.number().finite().nonnegative().optional(),
  packages: z.array(PackageSpecSchema).min(1, 'At least one package is required to quote.'),
});
export type QuoteShippingInput = z.infer<typeof QuoteShippingInputSchema>;

// ---------------------------------------------------------------------------
// Shipment Entity Schema
// ---------------------------------------------------------------------------

export const ShipmentJSONSchema = z.object({
  schemaVersion: z.literal(LOGISTICS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  trackingCode: NonEmptyStringSchema,
  orderId: z.string().trim().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  status: ShipmentStatusSchema,
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSpecSchema).min(1),
  shippingFee: PositiveMoneyJSONSchema,
  driverId: z.string().trim().min(1).optional(),
  routeId: z.string().trim().min(1).optional(),
  deliveryPin: z.string().trim().min(4).max(12).optional(),
  scheduledWindowStart: IsoDateTimeSchema.optional(),
  scheduledWindowEnd: IsoDateTimeSchema.optional(),
  trackingEvents: z.array(TrackingEventSchema),
  deliveryAttempts: z.array(DeliveryAttemptSchema),
  proofOfDelivery: ProofOfDeliverySchema.optional(),
  notes: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ShipmentJSON = z.infer<typeof ShipmentJSONSchema>;

// ---------------------------------------------------------------------------
// Driver Entity Schema
// ---------------------------------------------------------------------------

export const DriverStatusSchema = z.enum(['AVAILABLE', 'ON_ROUTE', 'OFFLINE']);
export type DriverStatus = z.infer<typeof DriverStatusSchema>;

export const VehicleTypeSchema = z.enum(['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK', 'BICYCLE', 'ON_FOOT']);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const DriverJSONSchema = z.object({
  schemaVersion: z.literal(LOGISTICS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  phone: z.string().trim().min(1).optional(),
  vehicleType: VehicleTypeSchema,
  vehiclePlate: z.string().trim().min(1).optional(),
  status: DriverStatusSchema,
  maxPackages: z.number().int().positive().optional(),
  maxWeightGrams: z.number().int().positive().optional(),
  currentLocation: CoordinatesSchema.optional(),
  activeRouteId: z.string().trim().min(1).optional(),
  version: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DriverJSON = z.infer<typeof DriverJSONSchema>;

// ---------------------------------------------------------------------------
// Delivery Route / Batch Entity Schema
// ---------------------------------------------------------------------------

export const DeliveryRouteStatusSchema = z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export type DeliveryRouteStatus = z.infer<typeof DeliveryRouteStatusSchema>;

export const RouteStopStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'SKIPPED']);
export type RouteStopStatus = z.infer<typeof RouteStopStatusSchema>;

export const RouteStopSchema = z.object({
  sequence: z.number().int().positive(),
  shipmentId: NonEmptyStringSchema,
  status: RouteStopStatusSchema,
  estimatedArrivalAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),
});
export type RouteStop = z.infer<typeof RouteStopSchema>;

export const DeliveryRouteJSONSchema = z.object({
  schemaVersion: z.literal(LOGISTICS_SCHEMA_VERSION),
  id: NonEmptyStringSchema,
  name: NonEmptyStringSchema,
  driverId: NonEmptyStringSchema,
  status: DeliveryRouteStatusSchema,
  stops: z.array(RouteStopSchema),
  startedAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),
  version: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DeliveryRouteJSON = z.infer<typeof DeliveryRouteJSONSchema>;

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

export const LogisticsFeatureFlagsSchema = z.object({
  enableZoneRates: z.boolean().default(true),
  enableDistanceRates: z.boolean().default(true),
  enableWeightRates: z.boolean().default(true),
  enableFreeShippingThreshold: z.boolean().default(true),
  requireProofOfDelivery: z.boolean().default(false),
  requireDeliveryPin: z.boolean().default(false),
  maxDeliveryAttempts: z.number().int().positive().default(3),
  allowReturnFromFailed: z.boolean().default(true),
  enforceDriverCapacity: z.boolean().default(false),
});
export type LogisticsFeatureFlags = z.infer<typeof LogisticsFeatureFlagsSchema>;

export const DEFAULT_LOGISTICS_FEATURE_FLAGS: LogisticsFeatureFlags =
  LogisticsFeatureFlagsSchema.parse({});

// ---------------------------------------------------------------------------
// Validation Helper
// ---------------------------------------------------------------------------

export function parseOrThrowLogisticsInput<T>(schema: z.ZodType<T>, input: unknown, context: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    const summary = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
    throw new InvalidLogisticsInputError(`Invalid ${context}: ${summary}`, issues);
  }
  return result.data;
}

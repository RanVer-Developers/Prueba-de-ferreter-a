// Schemas & Types
export {
  LOGISTICS_SCHEMA_VERSION,
  PositiveMoneyJSONSchema,
  ActorSummarySchema,
  CoordinatesSchema,
  AddressSchema,
  PackageDimensionsCmSchema,
  PackageSpecSchema,
  ShipmentStatusSchema,
  DeliveryFailureReasonSchema,
  TrackingEventSchema,
  DeliveryAttemptSchema,
  ProofOfDeliverySchema,
  ShippingRateStrategySchema,
  ZoneRateEntrySchema,
  WeightTierSchema,
  ShippingRateRuleSchema,
  QuoteShippingInputSchema,
  ShipmentJSONSchema,
  DriverStatusSchema,
  VehicleTypeSchema,
  DriverJSONSchema,
  DeliveryRouteStatusSchema,
  RouteStopStatusSchema,
  RouteStopSchema,
  DeliveryRouteJSONSchema,
  LogisticsFeatureFlagsSchema,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  parseOrThrowLogisticsInput,
  type ActorSummary,
  type Coordinates,
  type Address,
  type PackageDimensionsCm,
  type PackageSpec,
  type ShipmentStatus,
  type DeliveryFailureReason,
  type TrackingEvent,
  type DeliveryAttempt,
  type ProofOfDelivery,
  type ShippingRateStrategy,
  type ZoneRateEntry,
  type WeightTier,
  type ShippingRateRule,
  type QuoteShippingInput,
  type ShipmentJSON,
  type DriverStatus,
  type VehicleType,
  type DriverJSON,
  type DeliveryRouteStatus,
  type RouteStopStatus,
  type RouteStop,
  type DeliveryRouteJSON,
  type LogisticsFeatureFlags,
} from './schemas/logistics-schemas.js';

// Errors
export {
  LogisticsDomainError,
  InvalidLogisticsInputError,
  ShipmentNotFoundError,
  DriverNotFoundError,
  RouteNotFoundError,
  InvalidShipmentStateError,
  InvalidRouteStateError,
  InvalidDriverStateError,
  DriverCapacityExceededError,
  ProofOfDeliveryRequiredError,
  InvalidDeliveryPinError,
  MaxDeliveryAttemptsExceededError,
  ShippingRateError,
  ConcurrencyError,
  FeatureDisabledError,
} from './domain/errors/logistics-errors.js';

// Events
export {
  type LogisticsDomainEvent,
  ShipmentCreatedEvent,
  ShipmentAssignedEvent,
  ShipmentStatusChangedEvent,
  DeliveryAttemptFailedEvent,
  ShipmentDeliveredEvent,
  RouteCreatedEvent,
  RouteStatusChangedEvent,
} from './domain/events/logistics-events.js';

// Entities
export {
  Shipment,
  type CreateShipmentParams,
  type CompleteDeliveryParams,
  type RecordFailedAttemptParams,
} from './domain/entities/shipment.js';
export { Driver, type CreateDriverParams } from './domain/entities/driver.js';
export {
  DeliveryRoute,
  type CreateDeliveryRouteParams,
} from './domain/entities/delivery-route.js';

// Services
export {
  TERMINAL_SHIPMENT_STATUSES,
  isTerminalShipmentStatus,
  getAllowedShipmentTransitions,
  assertValidShipmentTransition,
} from './domain/services/shipment-state-machine.js';
export {
  ShippingRateService,
  type ShippingQuoteResult,
} from './domain/services/shipping-rate.service.js';
export {
  LOGISTICS_TIER_PRESETS,
  resolveLogisticsFeatures,
  splitLogisticsFeatures,
  composeLogisticsFeatures,
  assertLogisticsFeatureEnabled,
  type LogisticsTier,
  type LogisticsFeatureProfile,
  type LogisticsBooleanFeature,
  type LogisticsBooleanFeatureFlags,
  type LogisticsPolicyConfig,
} from './domain/services/logistics-features.js';

// Contracts
export {
  type ShipmentQueryFilter,
  type IShipmentRepository,
  type IDriverRepository,
  type IDeliveryRouteRepository,
  type IShippingRateCatalog,
  type IClock,
  SystemClock,
  type LogisticsEventPublisher,
} from './contracts/logistics-contracts.js';

// In-Memory Repositories
export { InMemoryShipmentRepository } from './repositories/in-memory/in-memory-shipment.repository.js';
export { InMemoryDriverRepository } from './repositories/in-memory/in-memory-driver.repository.js';
export { InMemoryRouteRepository } from './repositories/in-memory/in-memory-route.repository.js';

// Use Cases
export {
  CreateShipmentUseCase,
  type CreateShipmentInput,
} from './use-cases/create-shipment.use-case.js';
export { QuoteShippingUseCase } from './use-cases/quote-shipping.use-case.js';
export {
  AssignDriverUseCase,
  type AssignDriverInput,
} from './use-cases/assign-driver.use-case.js';
export {
  TransitionShipmentStatusUseCase,
  type TransitionShipmentStatusInput,
} from './use-cases/transition-shipment-status.use-case.js';
export {
  RecordDeliveryAttemptUseCase,
  type RecordDeliveryAttemptInput,
} from './use-cases/record-delivery-attempt.use-case.js';
export {
  CompleteDeliveryUseCase,
  type CompleteDeliveryInput,
} from './use-cases/complete-delivery.use-case.js';
export {
  ManageDeliveryRouteUseCase,
  type CreateDeliveryRouteInput,
} from './use-cases/manage-delivery-route.use-case.js';
export * from './logistics-module.js';

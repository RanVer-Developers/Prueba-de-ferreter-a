import {
  IClock,
  IDeliveryRouteRepository,
  IDriverRepository,
  IShipmentRepository,
  IShippingRateCatalog,
  LogisticsEventPublisher,
  SystemClock,
} from './contracts/logistics-contracts.js';
import { ShippingRateError } from './domain/errors/logistics-errors.js';
import {
  LogisticsFeatureProfile,
  resolveLogisticsFeatures,
} from './domain/services/logistics-features.js';
import { InMemoryDriverRepository } from './repositories/in-memory/in-memory-driver.repository.js';
import { InMemoryRouteRepository } from './repositories/in-memory/in-memory-route.repository.js';
import { InMemoryShipmentRepository } from './repositories/in-memory/in-memory-shipment.repository.js';
import { LogisticsFeatureFlags, QuoteShippingInput } from './schemas/logistics-schemas.js';
import { AssignDriverInput, AssignDriverUseCase } from './use-cases/assign-driver.use-case.js';
import { CompleteDeliveryInput, CompleteDeliveryUseCase } from './use-cases/complete-delivery.use-case.js';
import { CreateShipmentInput, CreateShipmentUseCase } from './use-cases/create-shipment.use-case.js';
import {
  CreateDeliveryRouteInput,
  ManageDeliveryRouteUseCase,
} from './use-cases/manage-delivery-route.use-case.js';
import { QuoteShippingUseCase } from './use-cases/quote-shipping.use-case.js';
import {
  RecordDeliveryAttemptInput,
  RecordDeliveryAttemptUseCase,
} from './use-cases/record-delivery-attempt.use-case.js';
import {
  TransitionShipmentStatusInput,
  TransitionShipmentStatusUseCase,
} from './use-cases/transition-shipment-status.use-case.js';

export interface LogisticsModuleDeps {
  shipmentRepo?: IShipmentRepository;
  driverRepo?: IDriverRepository;
  routeRepo?: IDeliveryRouteRepository;
  rateCatalog?: IShippingRateCatalog;
  clock?: IClock;
  publishEvent?: LogisticsEventPublisher;
  featureProfile?: LogisticsFeatureProfile;
}

export function createLogisticsModule(deps: LogisticsModuleDeps = {}) {
  const shipmentRepo = deps.shipmentRepo ?? new InMemoryShipmentRepository();
  const driverRepo = deps.driverRepo ?? new InMemoryDriverRepository();
  const routeRepo = deps.routeRepo ?? new InMemoryRouteRepository();
  const clock = deps.clock ?? SystemClock;
  const features: LogisticsFeatureFlags = resolveLogisticsFeatures(deps.featureProfile);

  const createShipmentUseCase = new CreateShipmentUseCase(shipmentRepo, clock, deps.publishEvent);
  const assignDriverUseCase = new AssignDriverUseCase(
    shipmentRepo,
    driverRepo,
    features,
    clock,
    deps.publishEvent
  );
  const transitionStatusUseCase = new TransitionShipmentStatusUseCase(
    shipmentRepo,
    features,
    clock,
    deps.publishEvent
  );
  const recordAttemptUseCase = new RecordDeliveryAttemptUseCase(
    shipmentRepo,
    features,
    clock,
    deps.publishEvent
  );
  const completeDeliveryUseCase = new CompleteDeliveryUseCase(
    shipmentRepo,
    features,
    clock,
    deps.publishEvent
  );
  const manageRouteUseCase = new ManageDeliveryRouteUseCase(
    routeRepo,
    driverRepo,
    shipmentRepo,
    features,
    clock,
    deps.publishEvent
  );

  const quoteShippingUseCase = deps.rateCatalog
    ? new QuoteShippingUseCase(deps.rateCatalog, features)
    : undefined;

  return {
    features,
    repositories: { shipmentRepo, driverRepo, routeRepo },
    useCases: {
      createShipment: createShipmentUseCase,
      assignDriver: assignDriverUseCase,
      transitionStatus: transitionStatusUseCase,
      recordDeliveryAttempt: recordAttemptUseCase,
      completeDelivery: completeDeliveryUseCase,
      manageRoute: manageRouteUseCase,
      quoteShipping: quoteShippingUseCase,
    },
    createShipment: (input: CreateShipmentInput) => createShipmentUseCase.execute(input),
    quoteShipping: (ruleId: string, input: QuoteShippingInput) => {
      if (!quoteShippingUseCase) {
        throw new ShippingRateError(
          'IShippingRateCatalog adapter is required for quoteShipping in createLogisticsModule.'
        );
      }
      return quoteShippingUseCase.execute(ruleId, input);
    },
    assignDriver: (input: AssignDriverInput) => assignDriverUseCase.execute(input),
    transitionShipmentStatus: (input: TransitionShipmentStatusInput) =>
      transitionStatusUseCase.execute(input),
    recordDeliveryAttempt: (input: RecordDeliveryAttemptInput) =>
      recordAttemptUseCase.execute(input),
    completeDelivery: (input: CompleteDeliveryInput) => completeDeliveryUseCase.execute(input),
    createRoute: (input: CreateDeliveryRouteInput) => manageRouteUseCase.createRoute(input),
    startRoute: (routeId: string) => manageRouteUseCase.startRoute(routeId),
    completeRoute: (routeId: string) => manageRouteUseCase.completeRoute(routeId),
  };
}

export type LogisticsModule = ReturnType<typeof createLogisticsModule>;

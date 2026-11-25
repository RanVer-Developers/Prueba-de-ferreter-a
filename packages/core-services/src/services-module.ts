import {
  IServiceBillingPort,
  IServiceInventoryPort,
  IServicesClock,
  IServicesEventBus,
  SystemServicesClock,
} from './contracts/service-contracts.js';
import {
  ServicesFeatureFlags,
  ServicesFeatureProfile,
  resolveServicesFeatures,
} from './domain/services/services-features.js';
import { InMemoryServiceOrderRepository } from './repositories/in-memory/in-memory-service-order-repository.js';
import type { IServiceOrderRepository } from './repositories/service-order-repository.interface.js';
import {
  ApproveServiceOrderInput,
  ConsumeServicePartInput,
  CreateServiceOrderInput,
  RecordDiagnosisInput,
  RecordServiceLaborInput,
  TransitionServiceStatusInput,
  approveServiceOrder,
  consumeServicePart,
  createServiceOrder,
  recordServiceDiagnosisAndQuote,
  recordServiceLabor,
  transitionServiceOrderStatus,
} from './use-cases/manage-service-orders.use-case.js';

export interface ServicesModuleDeps {
  serviceOrderRepository?: IServiceOrderRepository;
  inventoryPort?: IServiceInventoryPort;
  billingPort?: IServiceBillingPort;
  eventBus?: IServicesEventBus;
  clock?: IServicesClock;
  featureProfile?: ServicesFeatureProfile;
}

export function createServicesModule(deps: ServicesModuleDeps = {}) {
  const serviceOrderRepository =
    deps.serviceOrderRepository ?? new InMemoryServiceOrderRepository();
  const clock = deps.clock ?? new SystemServicesClock();
  const features: ServicesFeatureFlags = resolveServicesFeatures(deps.featureProfile);

  const sharedDeps = {
    serviceOrderRepository,
    inventoryPort: deps.inventoryPort,
    billingPort: deps.billingPort,
    eventBus: deps.eventBus,
    clock,
    featureProfile: features,
  };

  return {
    features,
    repositories: { serviceOrderRepository },
    createServiceOrder: (input: CreateServiceOrderInput) =>
      createServiceOrder(input, sharedDeps),
    recordDiagnosisAndQuote: (input: RecordDiagnosisInput) =>
      recordServiceDiagnosisAndQuote(input, sharedDeps),
    approveServiceOrder: (input: ApproveServiceOrderInput) =>
      approveServiceOrder(input, sharedDeps),
    recordLabor: (input: RecordServiceLaborInput) => recordServiceLabor(input, sharedDeps),
    consumePart: (input: ConsumeServicePartInput) => consumeServicePart(input, sharedDeps),
    transitionStatus: (input: TransitionServiceStatusInput) =>
      transitionServiceOrderStatus(input, sharedDeps),
  };
}

export type ServicesModule = ReturnType<typeof createServicesModule>;

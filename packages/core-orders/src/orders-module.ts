import {
  IClock,
  ICouponCatalog,
  IOrderRepository,
  OrderEventPublisher,
  SystemClock,
} from './contracts/order-contracts.js';
import {
  OrderFeatureFlags,
  OrderFeatureProfile,
  resolveOrderFeatures,
} from './domain/services/order-features.js';
import { InMemoryOrderRepository } from './repositories/in-memory/in-memory-order-repository.js';
import { FulfillmentDetails, OrderSurcharge } from './schemas/order-schemas.js';
import { AddOrderLineUseCase } from './use-cases/add-order-line.use-case.js';
import { ApplyOrderDiscountUseCase } from './use-cases/apply-order-discount.use-case.js';
import { CreateOrderUseCase } from './use-cases/create-order.use-case.js';
import { GetOrderSummaryUseCase } from './use-cases/get-order-summary.use-case.js';
import { ManageOrderExtrasUseCase, SplitOrderInput } from './use-cases/manage-order-extras.use-case.js';
import {
  ConsolidateOrdersInput,
  ConvertQuoteToOrderInput,
  ImportOrdersBatchInput,
  QuoteAndMultiDocUseCase,
} from './use-cases/quote-and-multidoc.use-case.js';
import { RemoveOrderDiscountUseCase } from './use-cases/remove-order-discount.use-case.js';
import { RemoveOrderLineUseCase } from './use-cases/remove-order-line.use-case.js';
import { TransitionOrderStatusUseCase } from './use-cases/transition-order-status.use-case.js';
import { UpdateOrderLineUseCase } from './use-cases/update-order-line.use-case.js';
import { SplitOrderUseCase } from './use-cases/manage-order-extras.use-case.js';

export interface OrdersModuleDeps {
  orderRepo?: IOrderRepository;
  couponCatalog?: ICouponCatalog;
  publishEvent?: OrderEventPublisher;
  clock?: IClock;
  featureProfile?: OrderFeatureProfile;
}

export function createOrdersModule(deps: OrdersModuleDeps = {}) {
  const orderRepo = deps.orderRepo ?? new InMemoryOrderRepository();
  const clock = deps.clock ?? SystemClock;
  const features: OrderFeatureFlags = resolveOrderFeatures(deps.featureProfile);

  const createOrderUseCase = new CreateOrderUseCase(orderRepo, deps.publishEvent, clock, features);
  const addOrderLineUseCase = new AddOrderLineUseCase(orderRepo, deps.publishEvent, clock, features);
  const updateOrderLineUseCase = new UpdateOrderLineUseCase(orderRepo, deps.publishEvent, clock, features);
  const removeOrderLineUseCase = new RemoveOrderLineUseCase(orderRepo, deps.publishEvent, clock, features);
  const applyOrderDiscountUseCase = new ApplyOrderDiscountUseCase(
    orderRepo,
    deps.couponCatalog,
    deps.publishEvent,
    clock,
    features
  );
  const removeOrderDiscountUseCase = new RemoveOrderDiscountUseCase(
    orderRepo,
    deps.publishEvent,
    clock,
    features
  );
  const transitionOrderStatusUseCase = new TransitionOrderStatusUseCase(
    orderRepo,
    deps.publishEvent,
    clock,
    features
  );
  const getOrderSummaryUseCase = new GetOrderSummaryUseCase(orderRepo);
  const manageExtrasUseCase = new ManageOrderExtrasUseCase(orderRepo, features, clock);
  const splitOrderUseCase = new SplitOrderUseCase(orderRepo, features, clock);
  const quoteAndMultiDocUseCase = new QuoteAndMultiDocUseCase(orderRepo, clock, features);

  return {
    features,
    repositories: { orderRepo },
    useCases: {
      createOrder: createOrderUseCase,
      addOrderLine: addOrderLineUseCase,
      updateOrderLine: updateOrderLineUseCase,
      removeOrderLine: removeOrderLineUseCase,
      applyOrderDiscount: applyOrderDiscountUseCase,
      removeOrderDiscount: removeOrderDiscountUseCase,
      transitionOrderStatus: transitionOrderStatusUseCase,
      getOrderSummary: getOrderSummaryUseCase,
      manageExtras: manageExtrasUseCase,
      splitOrder: splitOrderUseCase,
      quoteAndMultiDoc: quoteAndMultiDocUseCase,
    },
    createOrder: (input: Parameters<CreateOrderUseCase['execute']>[0]) =>
      createOrderUseCase.execute(input),
    addLine: (input: Parameters<AddOrderLineUseCase['execute']>[0]) =>
      addOrderLineUseCase.execute(input),
    updateLine: (input: Parameters<UpdateOrderLineUseCase['execute']>[0]) =>
      updateOrderLineUseCase.execute(input),
    removeLine: (input: Parameters<RemoveOrderLineUseCase['execute']>[0]) =>
      removeOrderLineUseCase.execute(input),
    applyDiscount: (input: Parameters<ApplyOrderDiscountUseCase['execute']>[0]) =>
      applyOrderDiscountUseCase.execute(input),
    removeDiscount: (input: Parameters<RemoveOrderDiscountUseCase['execute']>[0]) =>
      removeOrderDiscountUseCase.execute(input),
    transitionStatus: (input: Parameters<TransitionOrderStatusUseCase['execute']>[0]) =>
      transitionOrderStatusUseCase.execute(input),
    getSummary: (orderId: string) => getOrderSummaryUseCase.execute(orderId),
    parkOrder: (orderId: string, reason?: string, profile?: OrderFeatureProfile) =>
      manageExtrasUseCase.parkOrder(orderId, reason, profile),
    resumeOrder: (orderId: string, profile?: OrderFeatureProfile) =>
      manageExtrasUseCase.resumeOrder(orderId, profile),
    setFulfillment: (
      orderId: string,
      details: FulfillmentDetails,
      profile?: OrderFeatureProfile
    ) => manageExtrasUseCase.setFulfillment(orderId, details, profile),
    addSurcharge: (
      orderId: string,
      surcharge: OrderSurcharge,
      profile?: OrderFeatureProfile
    ) => manageExtrasUseCase.addSurcharge(orderId, surcharge, profile),
    removeSurcharge: (orderId: string, surchargeId: string, profile?: OrderFeatureProfile) =>
      manageExtrasUseCase.removeSurcharge(orderId, surchargeId, profile),
    splitOrder: (input: SplitOrderInput) => splitOrderUseCase.execute(input),
    convertQuoteToOrder: (input: ConvertQuoteToOrderInput) =>
      quoteAndMultiDocUseCase.convertQuoteToOrder(input),
    consolidateOrders: (input: ConsolidateOrdersInput) =>
      quoteAndMultiDocUseCase.consolidateOrders(input),
    importOrdersBatch: (input: ImportOrdersBatchInput) =>
      quoteAndMultiDocUseCase.importOrdersBatch(input),
  };
}

export type OrdersModule = ReturnType<typeof createOrdersModule>;

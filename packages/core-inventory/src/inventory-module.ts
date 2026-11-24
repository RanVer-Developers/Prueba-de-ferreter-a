import { IInventoryEventBus } from './domain/events/inventory-events.js';
import {
  InventoryFeatureFlags,
  InventoryFeatureProfile,
  resolveInventoryFeatures,
} from './domain/services/inventory-features.js';
import { ICompositeProductRepository } from './repositories/composite-product-repository.interface.js';
import { InMemoryCompositeProductRepository } from './repositories/in-memory/in-memory-composite-product-repository.js';
import { InMemoryInventoryCountRepository } from './repositories/in-memory/in-memory-inventory-count-repository.js';
import { InMemoryInventoryRepository } from './repositories/in-memory/in-memory-inventory-repository.js';
import { InMemoryReceivingOrderRepository } from './repositories/in-memory/in-memory-receiving-order-repository.js';
import { InMemoryStockMovementRepository } from './repositories/in-memory/in-memory-stock-movement-repository.js';
import { InMemoryStockReservationRepository } from './repositories/in-memory/in-memory-stock-reservation-repository.js';
import { InMemoryStockTransferRepository } from './repositories/in-memory/in-memory-stock-transfer-repository.js';
import { InMemoryWarehouseRepository } from './repositories/in-memory/in-memory-warehouse-repository.js';
import { IInventoryCountRepository } from './repositories/inventory-count-repository.interface.js';
import { IInventoryItemRepository } from './repositories/inventory-item-repository.interface.js';
import { IReceivingOrderRepository } from './repositories/receiving-order-repository.interface.js';
import { IStockMovementRepository } from './repositories/stock-movement-repository.interface.js';
import { IStockReservationRepository } from './repositories/stock-reservation-repository.interface.js';
import { IStockTransferRepository } from './repositories/stock-transfer-repository.interface.js';
import { IWarehouseRepository } from './repositories/warehouse-repository.interface.js';
import { AdjustStockUseCase } from './use-cases/adjust-stock.use-case.js';
import { AssembleProductUseCase } from './use-cases/assemble-product.use-case.js';
import { BreakPackUseCase } from './use-cases/break-pack.use-case.js';
import { DispatchCompositeProductUseCase } from './use-cases/dispatch-composite-product.use-case.js';
import { GetExpiringLotsUseCase } from './use-cases/get-expiring-lots.use-case.js';
import { GetKardexUseCase } from './use-cases/get-kardex.use-case.js';
import { GetLowStockAlertsUseCase } from './use-cases/get-low-stock-alerts.use-case.js';
import { GetStockAvailabilityUseCase } from './use-cases/get-stock-availability.use-case.js';
import {
  ExpireLotsUseCase,
  GetReplenishmentSuggestionsUseCase,
  SelectCycleCountItemsUseCase,
} from './use-cases/inventory-operations-enhancements.use-case.js';
import { ManageLotQuarantineUseCase } from './use-cases/manage-lot-quarantine.use-case.js';
import { ReceivePurchaseOrderUseCase } from './use-cases/receive-purchase-order.use-case.js';
import { ReconcileInventoryCountUseCase } from './use-cases/reconcile-inventory-count.use-case.js';
import { RecordCustomerReturnUseCase } from './use-cases/record-customer-return.use-case.js';
import { RecordStockInUseCase } from './use-cases/record-stock-in.use-case.js';
import { RecordStockOutUseCase } from './use-cases/record-stock-out.use-case.js';
import { RecordSupplierReturnUseCase } from './use-cases/record-supplier-return.use-case.js';
import { ReleaseExpiredReservationsUseCase } from './use-cases/release-expired-reservations.use-case.js';
import { ReserveStockUseCase } from './use-cases/reserve-stock.use-case.js';
import { TransferStockUseCase } from './use-cases/transfer-stock.use-case.js';

export interface InventoryModuleDeps {
  itemRepo?: IInventoryItemRepository;
  warehouseRepo?: IWarehouseRepository;
  transferRepo?: IStockTransferRepository;
  countRepo?: IInventoryCountRepository;
  movementRepo?: IStockMovementRepository;
  receivingOrderRepo?: IReceivingOrderRepository;
  reservationRepo?: IStockReservationRepository;
  compositeRepo?: ICompositeProductRepository;
  eventBus?: IInventoryEventBus;
  featureProfile?: InventoryFeatureProfile;
}

export function createInventoryModule(deps: InventoryModuleDeps = {}) {
  const itemRepo = deps.itemRepo ?? new InMemoryInventoryRepository();
  const warehouseRepo = deps.warehouseRepo ?? new InMemoryWarehouseRepository();
  const transferRepo = deps.transferRepo ?? new InMemoryStockTransferRepository();
  const countRepo = deps.countRepo ?? new InMemoryInventoryCountRepository();
  const movementRepo = deps.movementRepo ?? new InMemoryStockMovementRepository();
  const receivingOrderRepo = deps.receivingOrderRepo ?? new InMemoryReceivingOrderRepository();
  const reservationRepo = deps.reservationRepo ?? new InMemoryStockReservationRepository();
  const compositeRepo = deps.compositeRepo ?? new InMemoryCompositeProductRepository();
  const features: InventoryFeatureFlags = resolveInventoryFeatures(deps.featureProfile);

  const recordStockInUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo, deps.eventBus);
  const recordStockOutUseCase = new RecordStockOutUseCase(itemRepo, warehouseRepo, movementRepo, deps.eventBus);
  const transferStockUseCase = new TransferStockUseCase(
    itemRepo,
    warehouseRepo,
    transferRepo,
    movementRepo,
    deps.eventBus
  );
  const adjustStockUseCase = new AdjustStockUseCase(itemRepo, warehouseRepo, movementRepo, deps.eventBus);
  const reserveStockUseCase = new ReserveStockUseCase(
    itemRepo,
    movementRepo,
    reservationRepo,
    deps.eventBus
  );
  const releaseExpiredReservationsUseCase = new ReleaseExpiredReservationsUseCase(
    itemRepo,
    reservationRepo,
    deps.eventBus
  );
  const reconcileCountUseCase = new ReconcileInventoryCountUseCase(countRepo, itemRepo, movementRepo);
  const getAvailabilityUseCase = new GetStockAvailabilityUseCase(itemRepo);
  const getLowStockAlertsUseCase = new GetLowStockAlertsUseCase(itemRepo);
  const getExpiringLotsUseCase = new GetExpiringLotsUseCase(itemRepo, deps.eventBus);
  const manageLotQuarantineUseCase = new ManageLotQuarantineUseCase(
    itemRepo,
    warehouseRepo,
    movementRepo,
    deps.eventBus
  );
  const recordCustomerReturnUseCase = new RecordCustomerReturnUseCase(
    itemRepo,
    warehouseRepo,
    movementRepo
  );
  const recordSupplierReturnUseCase = new RecordSupplierReturnUseCase(
    itemRepo,
    warehouseRepo,
    movementRepo
  );
  const receivePurchaseOrderUseCase = new ReceivePurchaseOrderUseCase(
    receivingOrderRepo,
    itemRepo,
    warehouseRepo,
    movementRepo
  );
  const breakPackUseCase = new BreakPackUseCase(itemRepo, warehouseRepo, movementRepo);
  const dispatchCompositeUseCase = new DispatchCompositeProductUseCase(
    compositeRepo,
    itemRepo,
    warehouseRepo,
    movementRepo,
    deps.eventBus
  );
  const assembleProductUseCase = new AssembleProductUseCase(
    itemRepo,
    warehouseRepo,
    movementRepo,
    deps.eventBus
  );
  const getKardexUseCase = new GetKardexUseCase(movementRepo);
  const replenishmentUseCase = new GetReplenishmentSuggestionsUseCase(itemRepo, features);
  const expireLotsUseCase = new ExpireLotsUseCase(itemRepo, deps.eventBus, features);
  const selectCycleCountItemsUseCase = new SelectCycleCountItemsUseCase(itemRepo, features);

  return {
    features,
    repositories: {
      itemRepo,
      warehouseRepo,
      transferRepo,
      countRepo,
      movementRepo,
      receivingOrderRepo,
      reservationRepo,
      compositeRepo,
    },
    useCases: {
      recordStockIn: recordStockInUseCase,
      recordStockOut: recordStockOutUseCase,
      transferStock: transferStockUseCase,
      adjustStock: adjustStockUseCase,
      reserveStock: reserveStockUseCase,
      releaseExpiredReservations: releaseExpiredReservationsUseCase,
      reconcileInventoryCount: reconcileCountUseCase,
      getStockAvailability: getAvailabilityUseCase,
      getLowStockAlerts: getLowStockAlertsUseCase,
      getExpiringLots: getExpiringLotsUseCase,
      manageLotQuarantine: manageLotQuarantineUseCase,
      recordCustomerReturn: recordCustomerReturnUseCase,
      recordSupplierReturn: recordSupplierReturnUseCase,
      receivePurchaseOrder: receivePurchaseOrderUseCase,
      breakPack: breakPackUseCase,
      dispatchCompositeProduct: dispatchCompositeUseCase,
      assembleProduct: assembleProductUseCase,
      getKardex: getKardexUseCase,
      getReplenishmentSuggestions: replenishmentUseCase,
      expireLots: expireLotsUseCase,
      selectCycleCountItems: selectCycleCountItemsUseCase,
    },
    recordStockIn: (...args: Parameters<RecordStockInUseCase['execute']>) =>
      recordStockInUseCase.execute(...args),
    recordStockOut: (...args: Parameters<RecordStockOutUseCase['execute']>) =>
      recordStockOutUseCase.execute(...args),
    transferStock: (...args: Parameters<TransferStockUseCase['execute']>) =>
      transferStockUseCase.execute(...args),
    adjustStock: (...args: Parameters<AdjustStockUseCase['execute']>) =>
      adjustStockUseCase.execute(...args),
    reserveStock: (...args: Parameters<ReserveStockUseCase['execute']>) =>
      reserveStockUseCase.execute(...args),
    releaseExpiredReservations: (
      ...args: Parameters<ReleaseExpiredReservationsUseCase['execute']>
    ) => releaseExpiredReservationsUseCase.execute(...args),
    reconcileInventoryCount: (
      ...args: Parameters<ReconcileInventoryCountUseCase['execute']>
    ) => reconcileCountUseCase.execute(...args),
    getStockAvailability: (...args: Parameters<GetStockAvailabilityUseCase['execute']>) =>
      getAvailabilityUseCase.execute(...args),
    getLowStockAlerts: (...args: Parameters<GetLowStockAlertsUseCase['execute']>) =>
      getLowStockAlertsUseCase.execute(...args),
    getExpiringLots: (...args: Parameters<GetExpiringLotsUseCase['execute']>) =>
      getExpiringLotsUseCase.execute(...args),
    manageLotQuarantine: (...args: Parameters<ManageLotQuarantineUseCase['execute']>) =>
      manageLotQuarantineUseCase.execute(...args),
    recordCustomerReturn: (...args: Parameters<RecordCustomerReturnUseCase['execute']>) =>
      recordCustomerReturnUseCase.execute(...args),
    recordSupplierReturn: (...args: Parameters<RecordSupplierReturnUseCase['execute']>) =>
      recordSupplierReturnUseCase.execute(...args),
    receivePurchaseOrder: (...args: Parameters<ReceivePurchaseOrderUseCase['execute']>) =>
      receivePurchaseOrderUseCase.execute(...args),
    breakPack: (...args: Parameters<BreakPackUseCase['execute']>) =>
      breakPackUseCase.execute(...args),
    dispatchCompositeProduct: (
      ...args: Parameters<DispatchCompositeProductUseCase['execute']>
    ) => dispatchCompositeUseCase.execute(...args),
    assembleProduct: (...args: Parameters<AssembleProductUseCase['execute']>) =>
      assembleProductUseCase.execute(...args),
    getKardex: (...args: Parameters<GetKardexUseCase['execute']>) =>
      getKardexUseCase.execute(...args),
    getReplenishmentSuggestions: (
      ...args: Parameters<GetReplenishmentSuggestionsUseCase['execute']>
    ) => replenishmentUseCase.execute(...args),
    expireLots: (...args: Parameters<ExpireLotsUseCase['execute']>) =>
      expireLotsUseCase.execute(...args),
    selectCycleCountItems: (...args: Parameters<SelectCycleCountItemsUseCase['execute']>) =>
      selectCycleCountItemsUseCase.execute(...args),
  };
}

export type InventoryModule = ReturnType<typeof createInventoryModule>;

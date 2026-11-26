import { ReceivingOrder } from '../domain/entities/receiving-order.js';
import { StockMovement, StockMovementType, UserSummary } from '../domain/entities/stock-movement.js';
import {
  ItemNotFoundError,
  ReceivingOrderNotFoundError,
  WarehouseInactiveError,
  WarehouseNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { BatchLotProps } from '../domain/value-objects/batch-lot.js';
import { Money } from '../domain/value-objects/money.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IReceivingOrderRepository } from '../repositories/receiving-order-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface ReceivePurchaseOrderRequest {
  orderId: string;
  itemId: string;
  quantity: number;
  unitCost?: Money;
  lotProps?: Omit<BatchLotProps, 'costPerUnit'>;
  serialNumbers?: string[];
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  notes?: string;
  allowOverdelivery?: boolean;
}

export interface ReceivePurchaseOrderResponse {
  order: ReceivingOrder;
  movement: StockMovement;
  pendingQuantityForThisItem: number;
  isOrderCompleted: boolean;
}

export class ReceivePurchaseOrderUseCase {
  constructor(
    private readonly orderRepo: IReceivingOrderRepository,
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository
  ) {}

  public async execute(request: ReceivePurchaseOrderRequest): Promise<ReceivePurchaseOrderResponse> {
    const order = await this.orderRepo.findById(request.orderId);
    if (!order) {
      throw new ReceivingOrderNotFoundError(request.orderId);
    }

    const warehouse = await this.warehouseRepo.findById(order.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(order.warehouseId);
    if (!warehouse.isActive) throw new WarehouseInactiveError(order.warehouseId);

    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    // 1. Registrar recepción en la orden (valida sobredespacho y recalcula pendientes)
    const updatedOrder = order.receiveItem({
      itemId: request.itemId,
      quantity: request.quantity,
      allowOverdelivery: request.allowOverdelivery,
    });

    const orderItem = order.items.find((it) => it.itemId === request.itemId)!;
    const cost = request.unitCost ?? orderItem.unitCost;

    const movementId = generateInventoryId('mov-po-rec');

    // 2. Dar entrada al stock en almacén con Kardex
    const { movement } = item.receiveStock({
      movementId,
      warehouseId: order.warehouseId,
      quantity: request.quantity,
      unitCost: cost,
      referenceId: order.orderNumber,
      lotProps: request.lotProps,
      serials: request.serialNumbers,
      performedBy: request.performedBy,
      authorizedBy: request.authorizedBy,
      notes: request.notes ?? `Recepción parcial/total OC: ${order.orderNumber}`,
      movementType: StockMovementType.PURCHASE_RECEIPT,
    });

    await this.orderRepo.save(updatedOrder);
    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    return {
      order: updatedOrder,
      movement,
      pendingQuantityForThisItem: updatedOrder.getPendingQuantity(request.itemId),
      isOrderCompleted: updatedOrder.isFullyReceived(),
    };
  }
}

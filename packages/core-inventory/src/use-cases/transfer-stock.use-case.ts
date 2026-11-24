import { StockMovement, UserSummary } from '../domain/entities/stock-movement.js';
import { StockTransfer } from '../domain/entities/stock-transfer.js';
import {
  InvalidTransferStateError,
  ItemNotFoundError,
  TransferNotFoundError,
  WarehouseInactiveError,
  WarehouseNotFoundError,
} from '../domain/errors/inventory-errors.js';
import { IInventoryEventBus } from '../domain/events/inventory-events.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IStockTransferRepository } from '../repositories/stock-transfer-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export interface DispatchTransferRequest {
  action: 'DISPATCH';
  transferId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  itemId: string;
  quantity: number;
  lotNumber?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  notes?: string;
}

export interface ReceiveTransferRequest {
  action: 'RECEIVE';
  transferId: string;
  quantityReceived: number;
  discrepancyReason?: string;
  performedBy: UserSummary;
  notes?: string;
}

export interface CancelTransferRequest {
  action: 'CANCEL';
  transferId: string;
  reason: string;
  performedBy: UserSummary;
}

export type TransferStockRequest = DispatchTransferRequest | ReceiveTransferRequest | CancelTransferRequest;

export interface TransferStockResponse {
  transfer: StockTransfer;
  movement: StockMovement;
}

export class TransferStockUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly transferRepo: IStockTransferRepository,
    private readonly movementRepo: IStockMovementRepository,
    private readonly eventBus?: IInventoryEventBus
  ) {}

  public async execute(request: TransferStockRequest): Promise<TransferStockResponse> {
    if (request.action === 'DISPATCH') {
      return this.handleDispatch(request);
    }
    if (request.action === 'RECEIVE') {
      return this.handleReceive(request);
    }
    return this.handleCancel(request);
  }

  private async handleDispatch(request: DispatchTransferRequest): Promise<TransferStockResponse> {
    const fromWh = await this.warehouseRepo.findById(request.fromWarehouseId);
    if (!fromWh) throw new WarehouseNotFoundError(request.fromWarehouseId);
    if (!fromWh.isActive) throw new WarehouseInactiveError(request.fromWarehouseId);

    const toWh = await this.warehouseRepo.findById(request.toWarehouseId);
    if (!toWh) throw new WarehouseNotFoundError(request.toWarehouseId);
    if (!toWh.isActive) throw new WarehouseInactiveError(request.toWarehouseId);

    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    const preDispatchSnapshot = item.toJSON();
    const movementId = generateInventoryId('mov-trf-out');
    const movement = item.transferOut({
      movementId,
      fromWarehouseId: request.fromWarehouseId,
      toWarehouseId: request.toWarehouseId,
      quantity: request.quantity,
      transferId: request.transferId,
      lotNumber: request.lotNumber,
      serialNumbers: request.serialNumbers,
      performedBy: request.performedBy,
    });

    let transfer = new StockTransfer({
      id: request.transferId,
      fromWarehouseId: request.fromWarehouseId,
      toWarehouseId: request.toWarehouseId,
      itemId: request.itemId,
      quantitySent: request.quantity,
      lotNumber: movement.lotNumber ?? request.lotNumber,
      serialNumbers: request.serialNumbers,
      notes: request.notes,
    });

    transfer = transfer.dispatch(request.performedBy);

    await this.itemRepo.save(item);
    try {
      await this.transferRepo.save(transfer);
      await this.movementRepo.save(movement);
    } catch (err) {
      const { InventoryItem } = await import('../domain/entities/inventory-item.js');
      await this.itemRepo.save(InventoryItem.fromJSON(preDispatchSnapshot)).catch(() => undefined);
      throw err;
    }

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { transfer, movement };
  }

  private async handleReceive(request: ReceiveTransferRequest): Promise<TransferStockResponse> {
    const transfer = await this.transferRepo.findById(request.transferId);
    if (!transfer) {
      throw new TransferNotFoundError(request.transferId);
    }

    if (transfer.status !== 'IN_TRANSIT') {
      throw new InvalidTransferStateError(transfer.id, transfer.status, 'Recepcionar traslado');
    }

    const toWh = await this.warehouseRepo.findById(transfer.toWarehouseId);
    if (!toWh) throw new WarehouseNotFoundError(transfer.toWarehouseId);
    if (!toWh.isActive) throw new WarehouseInactiveError(transfer.toWarehouseId);

    const item = await this.itemRepo.findById(transfer.itemId);
    if (!item) throw new ItemNotFoundError(transfer.itemId);

    const preReceiveSnapshot = item.toJSON();
    const updatedTransfer = transfer.receive(
      request.performedBy,
      request.quantityReceived,
      request.discrepancyReason
    );

    const movementId = generateInventoryId('mov-trf-in');
    const movement = item.transferIn({
      movementId,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      quantitySent: transfer.quantitySent,
      quantityReceived: request.quantityReceived,
      transferId: transfer.id,
      lotNumber: transfer.lotNumber,
      serialNumbers: transfer.serialNumbers,
      performedBy: request.performedBy,
    });

    await this.itemRepo.save(item);
    try {
      await this.transferRepo.save(updatedTransfer);
      await this.movementRepo.save(movement);
    } catch (err) {
      const { InventoryItem } = await import('../domain/entities/inventory-item.js');
      await this.itemRepo.save(InventoryItem.fromJSON(preReceiveSnapshot)).catch(() => undefined);
      throw err;
    }

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { transfer: updatedTransfer, movement };
  }

  private async handleCancel(request: CancelTransferRequest): Promise<TransferStockResponse> {
    const transfer = await this.transferRepo.findById(request.transferId);
    if (!transfer) {
      throw new TransferNotFoundError(request.transferId);
    }
    if (transfer.status !== 'IN_TRANSIT') {
      throw new InvalidTransferStateError(transfer.id, transfer.status, 'Cancelar traslado en tránsito');
    }

    const item = await this.itemRepo.findById(transfer.itemId);
    if (!item) throw new ItemNotFoundError(transfer.itemId);

    const preCancelSnapshot = item.toJSON();
    const cancelledTransfer = transfer.cancel(request.reason);
    const movementId = generateInventoryId('mov-trf-can');
    const movement = item.cancelTransferOut({
      movementId,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      quantity: transfer.quantitySent,
      transferId: transfer.id,
      lotNumber: transfer.lotNumber,
      serialNumbers: transfer.serialNumbers,
      reason: request.reason,
      performedBy: request.performedBy,
    });

    await this.itemRepo.save(item);
    try {
      await this.transferRepo.save(cancelledTransfer);
      await this.movementRepo.save(movement);
    } catch (err) {
      const { InventoryItem } = await import('../domain/entities/inventory-item.js');
      await this.itemRepo.save(InventoryItem.fromJSON(preCancelSnapshot)).catch(() => undefined);
      throw err;
    }

    if (this.eventBus) {
      const events = item.pullDomainEvents();
      if (events.length > 0) await this.eventBus.publish(events);
    }

    return { transfer: cancelledTransfer, movement };
  }
}

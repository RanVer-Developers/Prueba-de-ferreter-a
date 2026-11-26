import { StockMovement, StockMovementType, UserSummary } from '../domain/entities/stock-movement.js';
import { ItemNotFoundError, WarehouseInactiveError, WarehouseNotFoundError } from '../domain/errors/inventory-errors.js';
import { generateInventoryId } from '../domain/services/schema-validation.js';
import { Money } from '../domain/value-objects/money.js';
import { IInventoryItemRepository } from '../repositories/inventory-item-repository.interface.js';
import { IStockMovementRepository } from '../repositories/stock-movement-repository.interface.js';
import { IWarehouseRepository } from '../repositories/warehouse-repository.interface.js';

export type CustomerReturnDestination = 'RESTOCK' | 'QUARANTINE' | 'DAMAGED_WRITE_OFF';

export interface RecordCustomerReturnRequest {
  itemId: string;
  warehouseId: string;
  quantity: number;
  referenceId: string; // Folio de venta original / ticket
  destination: CustomerReturnDestination;
  unitCost?: Money;
  lotNumber?: string;
  serialNumbers?: string[];
  performedBy: UserSummary;
  authorizedBy?: UserSummary;
  notes?: string;
  idempotencyKey?: string;
}

export interface RecordCustomerReturnResponse {
  movement: StockMovement;
  writeOffMovement?: StockMovement;
  destination: CustomerReturnDestination;
  isReplay: boolean;
}

export class RecordCustomerReturnUseCase {
  constructor(
    private readonly itemRepo: IInventoryItemRepository,
    private readonly warehouseRepo: IWarehouseRepository,
    private readonly movementRepo: IStockMovementRepository
  ) {}

  public async execute(request: RecordCustomerReturnRequest): Promise<RecordCustomerReturnResponse> {
    if (request.idempotencyKey) {
      const existing = await this.movementRepo.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        return { movement: existing, destination: request.destination, isReplay: true };
      }
    }

    const warehouse = await this.warehouseRepo.findById(request.warehouseId);
    if (!warehouse) throw new WarehouseNotFoundError(request.warehouseId);
    if (!warehouse.isActive) throw new WarehouseInactiveError(request.warehouseId);

    const item = await this.itemRepo.findById(request.itemId);
    if (!item) throw new ItemNotFoundError(request.itemId);

    const cost = request.unitCost ?? item.averageCost;
    const movementId = generateInventoryId('mov-ret-cust');

    // 1. Reingresar la mercancía al inventario con tipo CUSTOMER_RETURN
    const { movement } = item.receiveStock({
      movementId,
      warehouseId: request.warehouseId,
      quantity: request.quantity,
      unitCost: cost,
      referenceId: request.referenceId,
      serials: request.serialNumbers,
      performedBy: request.performedBy,
      authorizedBy: request.authorizedBy,
      notes: request.notes ?? `Devolución de cliente ticket ${request.referenceId} [Destino: ${request.destination}]`,
      idempotencyKey: request.idempotencyKey,
      movementType: StockMovementType.CUSTOMER_RETURN,
    });

    let writeOffMovement: StockMovement | undefined;

    // 2. Si el destino es DAMAGED_WRITE_OFF, dar de baja inmediata como merma
    if (request.destination === 'DAMAGED_WRITE_OFF') {
      const writeOffId = generateInventoryId('mov-writeoff');
      writeOffMovement = item.adjustStock({
        movementId: writeOffId,
        warehouseId: request.warehouseId,
        deltaQuantity: -request.quantity,
        reason: `Baja inmediata por producto devuelto dañado (Ref: ${request.referenceId})`,
        unitCost: cost,
        performedBy: request.performedBy,
        authorizedBy: request.authorizedBy,
      });
      await this.movementRepo.save(writeOffMovement);
    }

    await this.itemRepo.save(item);
    await this.movementRepo.save(movement);

    return {
      movement,
      writeOffMovement,
      destination: request.destination,
      isReplay: false,
    };
  }
}

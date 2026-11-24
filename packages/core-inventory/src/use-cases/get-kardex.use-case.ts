import { StockMovement, StockMovementType } from '../domain/entities/stock-movement.js';
import { CurrencyMismatchError } from '../domain/errors/inventory-errors.js';
import { Money } from '../domain/value-objects/money.js';
import { IStockMovementRepository, KardexFilter } from '../repositories/stock-movement-repository.interface.js';

export interface GetKardexRequest extends KardexFilter {}

export interface GetKardexResponse {
  movements: StockMovement[];
  totalMovements: number;
  totalInboundQuantity: number;
  totalOutboundQuantity: number;
  totalInboundCost: Money;
  totalOutboundCost: Money;
}

const INBOUND_TYPES = new Set<StockMovementType>([
  StockMovementType.PURCHASE_RECEIPT,
  StockMovementType.TRANSFER_IN,
  StockMovementType.ADJUSTMENT_INCREASE,
  StockMovementType.CUSTOMER_RETURN,
  StockMovementType.PRODUCTION_OUTPUT,
  StockMovementType.INITIAL_BALANCE,
]);

export class GetKardexUseCase {
  constructor(private readonly movementRepo: IStockMovementRepository) {}

  public async execute(request: GetKardexRequest = {}): Promise<GetKardexResponse> {
    let movements: StockMovement[];
    let allForTotals: StockMovement[];
    let total: number;

    if (this.movementRepo.query) {
      const res = await this.movementRepo.query(request);
      movements = res.movements;
      total = res.total;
      if (total > movements.length) {
        const fullRes = await this.movementRepo.query({
          ...request,
          offset: undefined,
          limit: undefined,
        });
        allForTotals = fullRes.movements;
      } else {
        allForTotals = movements;
      }
    } else {
      const raw = request.itemId
        ? await this.movementRepo.listByItem(request.itemId)
        : request.warehouseId
          ? await this.movementRepo.listByWarehouse(request.warehouseId)
          : [];
      const filtered = raw.filter((m) => {
        if (request.warehouseId && m.warehouseId !== request.warehouseId) return false;
        if (request.type && m.type !== request.type) return false;
        if (request.referenceId && m.referenceId !== request.referenceId) return false;
        if (request.fromDate && m.createdAt.getTime() < request.fromDate.getTime()) return false;
        if (request.toDate && m.createdAt.getTime() > request.toDate.getTime()) return false;
        return true;
      });
      total = filtered.length;
      allForTotals = filtered;
      const offset = Math.max(0, request.offset ?? 0);
      const limit = request.limit !== undefined && request.limit > 0 ? request.limit : total;
      movements = filtered.slice(offset, offset + limit);
    }

    let totalInboundQuantity = 0;
    let totalOutboundQuantity = 0;
    let totalInboundCents = 0;
    let totalOutboundCents = 0;
    let currency: string | undefined;

    for (const mov of allForTotals) {
      if (currency === undefined) {
        currency = mov.totalCost.currency;
      } else if (mov.totalCost.currency !== currency) {
        throw new CurrencyMismatchError(currency, mov.totalCost.currency);
      }
      if (INBOUND_TYPES.has(mov.type)) {
        totalInboundQuantity += mov.quantity;
        totalInboundCents += mov.totalCost.toCents();
      } else {
        totalOutboundQuantity += mov.quantity;
        totalOutboundCents += mov.totalCost.toCents();
      }
    }

    const finalCurrency = currency ?? 'USD';

    return {
      movements,
      totalMovements: total,
      totalInboundQuantity,
      totalOutboundQuantity,
      totalInboundCost: Money.fromCents(totalInboundCents, finalCurrency),
      totalOutboundCost: Money.fromCents(totalOutboundCents, finalCurrency),
    };
  }
}

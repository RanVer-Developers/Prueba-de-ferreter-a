import { roundHalfEven } from '@modulos/core-shared';
import { InventoryItem } from '../entities/inventory-item.js';
import { StockMovement, StockMovementType, UserSummary } from '../entities/stock-movement.js';
import { BreakPackRatioError, CurrencyMismatchError, InsufficientStockError } from '../errors/inventory-errors.js';
import { generateInventoryId } from './schema-validation.js';
import { Money } from '../value-objects/money.js';

export interface BreakPackParams {
  warehouseId: string;
  parentItem: InventoryItem;
  parentQuantityToBreak: number;
  childItem: InventoryItem;
  unitsPerPack: number;
  performedBy: UserSummary;
  notes?: string;
}

export interface BreakPackResult {
  parentMovement: StockMovement;
  childMovement: StockMovement;
  totalCostTransferred: Money;
  childUnitCost: Money;
  totalChildUnitsCreated: number;
}

export interface AssemblyParams {
  warehouseId: string;
  recipeComponents: Array<{ item: InventoryItem; quantityPerUnit: number }>;
  finishedItem: InventoryItem;
  quantityToProduce: number;
  performedBy: UserSummary;
  additionalCostPerUnit?: Money;
  notes?: string;
}

export interface AssemblyResult {
  consumedMovements: StockMovement[];
  finishedMovement: StockMovement;
  totalProductionCost: Money;
  unitCost: Money;
}

/**
 * Servicio de dominio para transformaciones atómicas de stock:
 * Desempaque (Break-pack), Ensamble (Kits/Producción) y Despiece con conservación exacta de costos.
 */
export class StockTransformationService {
  /**
   * Desempaque atómico: Descuenta N bultos/cajas del item padre y crea las unidades sueltas correspondientes
   * en el item hijo, recalculando el costo unitario sin pérdida de centavos.
   */
  public static breakPack(params: BreakPackParams): BreakPackResult {
    if (params.unitsPerPack <= 0) {
      throw new BreakPackRatioError('El factor de unidades por empaque debe ser un entero positivo mayor a cero.');
    }
    if (params.parentQuantityToBreak <= 0) {
      throw new BreakPackRatioError('La cantidad de bultos a desempacar debe ser mayor a cero.');
    }

    const availableParent = params.parentItem.getAvailableStock(params.warehouseId);
    if (availableParent < params.parentQuantityToBreak) {
      throw new InsufficientStockError(
        params.parentItem.id,
        params.warehouseId,
        availableParent,
        params.parentQuantityToBreak
      );
    }

    const totalChildUnits = params.parentQuantityToBreak * params.unitsPerPack;
    const movementTime = new Date();

    // 1. Despachar del producto padre (consumo por desempaque)
    const movParentId = generateInventoryId('mov-brk-out');
    const { movement: parentMov, totalCost: totalCostTransferred } = params.parentItem.dispatchStock({
      movementId: movParentId,
      warehouseId: params.warehouseId,
      quantity: params.parentQuantityToBreak,
      performedBy: params.performedBy,
      notes: params.notes ?? `Desempaque hacia ${params.childItem.sku} (${totalChildUnits} unidades)`,
      dispatchedAt: movementTime,
      movementType: StockMovementType.PRODUCTION_CONSUMPTION,
    });

    // 2. Calcular costo unitario del producto hijo
    const childCents = roundHalfEven(totalCostTransferred.toCents() / totalChildUnits);
    const childUnitCost = Money.fromCents(childCents, totalCostTransferred.currency);

    // 3. Dar de alta en el producto hijo (entrada por desempaque)
    const movChildId = generateInventoryId('mov-brk-in');
    const { movement: childMov } = params.childItem.receiveStock({
      movementId: movChildId,
      warehouseId: params.warehouseId,
      quantity: totalChildUnits,
      unitCost: childUnitCost,
      performedBy: params.performedBy,
      notes: params.notes ?? `Ingreso por desempaque de ${params.parentQuantityToBreak} caja(s) de ${params.parentItem.sku}`,
      receivedAt: movementTime,
      movementType: StockMovementType.PRODUCTION_OUTPUT,
    });

    return {
      parentMovement: parentMov,
      childMovement: childMov,
      totalCostTransferred,
      childUnitCost,
      totalChildUnitsCreated: totalChildUnits,
    };
  }

  /**
   * Ensamble atómico de insumos para dar de alta producto terminado.
   */
  public static assemble(params: AssemblyParams): AssemblyResult {
    if (params.quantityToProduce <= 0) {
      throw new Error('La cantidad a producir debe ser mayor a cero.');
    }

    const currency = params.finishedItem.averageCost.currency;
    if (params.additionalCostPerUnit && params.additionalCostPerUnit.currency !== currency) {
      throw new CurrencyMismatchError(currency, params.additionalCostPerUnit.currency);
    }

    // 1. Validar disponibilidad y moneda de todos los insumos
    for (const comp of params.recipeComponents) {
      if (comp.item.averageCost.currency !== currency) {
        throw new CurrencyMismatchError(currency, comp.item.averageCost.currency);
      }
      const avail = comp.item.getAvailableStock(params.warehouseId);
      const needed = comp.quantityPerUnit * params.quantityToProduce;
      if (avail < needed) {
        throw new InsufficientStockError(comp.item.id, params.warehouseId, avail, needed);
      }
    }

    let totalInsumosCents = 0;
    const consumedMovements: StockMovement[] = [];
    const executionTime = new Date();

    // 2. Despachar insumos
    for (const comp of params.recipeComponents) {
      const needed = comp.quantityPerUnit * params.quantityToProduce;
      const movId = generateInventoryId('mov-asm-out');
      const { movement, totalCost } = comp.item.dispatchStock({
        movementId: movId,
        warehouseId: params.warehouseId,
        quantity: needed,
        performedBy: params.performedBy,
        notes: `Consumo para ensamble de ${params.quantityToProduce} x ${params.finishedItem.sku}`,
        dispatchedAt: executionTime,
        movementType: StockMovementType.PRODUCTION_CONSUMPTION,
      });

      if (totalCost.currency !== currency) {
        throw new CurrencyMismatchError(currency, totalCost.currency);
      }
      totalInsumosCents += totalCost.toCents();
      consumedMovements.push(movement);
    }

    // Costo adicional (mano de obra / indirectos)
    if (params.additionalCostPerUnit) {
      totalInsumosCents += params.additionalCostPerUnit.toCents() * params.quantityToProduce;
    }

    const totalProductionCost = Money.fromCents(totalInsumosCents, currency);
    const unitCost = Money.fromCents(
      roundHalfEven(totalInsumosCents / params.quantityToProduce),
      currency
    );

    // 3. Dar de alta producto terminado
    const movInId = generateInventoryId('mov-asm-in');
    const { movement: finishedMovement } = params.finishedItem.receiveStock({
      movementId: movInId,
      warehouseId: params.warehouseId,
      quantity: params.quantityToProduce,
      unitCost,
      performedBy: params.performedBy,
      notes: `Ingreso por ensamble (${params.quantityToProduce} unidades)`,
      receivedAt: executionTime,
      movementType: StockMovementType.PRODUCTION_OUTPUT,
    });

    return {
      consumedMovements,
      finishedMovement,
      totalProductionCost,
      unitCost,
    };
  }
}

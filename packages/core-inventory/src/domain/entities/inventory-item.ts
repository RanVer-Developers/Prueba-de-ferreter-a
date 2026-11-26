import { roundHalfEven } from '@modulos/core-shared';
import {
  BinLocationNotFoundError,
  CurrencyMismatchError,
  DuplicateSerialNumberError,
  InsufficientStockError,
  InvalidSerialNumberStateError,
  LotNotFoundError,
  NegativeStockNotAllowedError,
  SchemaValidationError,
  SerialNumberNotFoundError,
} from '../errors/inventory-errors.js';
import {
  InventoryDomainEvent,
  LotQuarantinedPayload,
  LowStockAlertPayload,
  OutOfStockAlertPayload,
  ReservationCommittedPayload,
  ReservationReleasedPayload,
  StockAdjustedPayload,
  StockDispatchedPayload,
  StockReceivedPayload,
  StockReservedPayload,
  StockTransferredPayload,
} from '../events/inventory-events.js';
import {
  INVENTORY_SCHEMA_VERSION,
  generateInventoryId,
} from '../services/schema-validation.js';
import { InventoryItemJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';
import { BatchLot, BatchLotJSON, BatchLotProps, LotStatus } from '../value-objects/batch-lot.js';
import { BinLocation, BinLocationJSON } from '../value-objects/bin-location.js';
import { Money, MoneyJSON } from '../value-objects/money.js';
import { SerialNumber, SerialNumberJSON } from '../value-objects/serial-number.js';
import { UnitOfMeasure, UnitOfMeasureJSON } from '../value-objects/unit-of-measure.js';
import {
  InventoryLayer,
  InventoryLayerJSON,
  ValuationMethod,
} from '../value-objects/valuation-strategy.js';
import { StockMovement, StockMovementType, UserSummary } from './stock-movement.js';
import { StockReservation } from './stock-reservation.js';

export interface ReorderRules {
  minStock: number;
  maxStock?: number;
  reorderPoint: number;
}

export interface WarehouseStockData {
  warehouseId: string;
  onHand: number;
  reserved: number;
  inTransit: number;
  layers: InventoryLayer[];
  lots: BatchLot[];
  serials: SerialNumber[];
  binLocations?: BinLocation[];
}

export interface WarehouseStockJSON {
  warehouseId: string;
  onHand: number;
  reserved: number;
  inTransit: number;
  layers: InventoryLayerJSON[];
  lots: BatchLotJSON[];
  serials: SerialNumberJSON[];
  binLocations?: BinLocationJSON[];
}

export interface InventoryItemProps {
  id: string;
  sku: string;
  barcode?: string;
  barcodes?: string[];
  name: string;
  description?: string;
  uom?: UnitOfMeasure;
  valuationMethod?: ValuationMethod;
  averageCost?: Money;
  standardCost?: Money;
  reorderRules?: ReorderRules;
  warehouseReorderRules?: Record<string, ReorderRules>;
  trackingType?: 'SIMPLE' | 'BATCH_LOT' | 'SERIAL';
  stocks?: Record<string, WarehouseStockData>;
  version?: number;
}

export interface InventoryItemJSON {
  schemaVersion?: number;
  id: string;
  sku: string;
  barcode?: string;
  barcodes?: string[];
  name: string;
  description?: string;
  uom: UnitOfMeasureJSON;
  valuationMethod: ValuationMethod;
  averageCost: MoneyJSON;
  standardCost?: MoneyJSON;
  reorderRules: ReorderRules;
  warehouseReorderRules?: Record<string, ReorderRules>;
  trackingType: 'SIMPLE' | 'BATCH_LOT' | 'SERIAL';
  stocks: Record<string, WarehouseStockJSON>;
  version: number;
}

export class InventoryItem {
  public readonly id: string;
  public readonly sku: string;
  public readonly barcode?: string;
  public readonly barcodes: string[];
  public readonly name: string;
  public readonly description?: string;
  public readonly uom: UnitOfMeasure;
  public readonly valuationMethod: ValuationMethod;
  public averageCost: Money;
  public readonly standardCost?: Money;
  public readonly reorderRules: ReorderRules;
  public readonly warehouseReorderRules: Record<string, ReorderRules>;
  public readonly trackingType: 'SIMPLE' | 'BATCH_LOT' | 'SERIAL';
  private readonly _stocks: Map<string, WarehouseStockData>;
  private _version: number;
  private _domainEvents: InventoryDomainEvent[] = [];

  constructor(props: InventoryItemProps) {
    this.id = props.id.trim();
    this.sku = props.sku.trim();

    const barcodeSet = new Set<string>();
    if (props.barcode?.trim()) {
      barcodeSet.add(props.barcode.trim());
    }
    if (props.barcodes) {
      for (const b of props.barcodes) {
        if (b?.trim()) barcodeSet.add(b.trim());
      }
    }
    this.barcodes = Array.from(barcodeSet);
    this.barcode = this.barcodes[0];

    this.name = props.name.trim();
    this.description = props.description;
    this.uom = props.uom ?? UnitOfMeasure.UNIT;
    this.valuationMethod = props.valuationMethod ?? 'WEIGHTED_AVERAGE';
    this.averageCost = props.averageCost ?? Money.zero();
    this.standardCost = props.standardCost;
    this.reorderRules = props.reorderRules ?? { minStock: 0, reorderPoint: 0 };
    this.warehouseReorderRules = props.warehouseReorderRules ? { ...props.warehouseReorderRules } : {};
    this.trackingType = props.trackingType ?? 'SIMPLE';
    this._version = props.version ?? 1;

    this._stocks = new Map();
    if (props.stocks) {
      for (const [whId, stock] of Object.entries(props.stocks)) {
        this._stocks.set(whId, {
          warehouseId: whId,
          onHand: stock.onHand,
          reserved: stock.reserved,
          inTransit: stock.inTransit,
          layers: [...stock.layers],
          lots: [...stock.lots],
          serials: [...stock.serials],
          binLocations: stock.binLocations ? [...stock.binLocations] : [],
        });
      }
    }
  }

  public get version(): number {
    return this._version;
  }

  public pullDomainEvents(): InventoryDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  private addEvent(event: InventoryDomainEvent): void {
    this._domainEvents.push(event);
  }

  private getOrCreateStock(warehouseId: string): WarehouseStockData {
    let stock = this._stocks.get(warehouseId);
    if (!stock) {
      stock = {
        warehouseId,
        onHand: 0,
        reserved: 0,
        inTransit: 0,
        layers: [],
        lots: [],
        serials: [],
        binLocations: [],
      };
      this._stocks.set(warehouseId, stock);
    } else if (!stock.binLocations) {
      stock.binLocations = [];
    }
    return stock;
  }

  public matchesBarcode(barcode: string): boolean {
    const clean = barcode.trim();
    return this.barcodes.includes(clean);
  }

  public getReorderRules(warehouseId?: string): ReorderRules {
    if (warehouseId && this.warehouseReorderRules[warehouseId]) {
      return this.warehouseReorderRules[warehouseId];
    }
    return this.reorderRules;
  }

  public getTotalOnHandStock(): number {
    let total = 0;
    for (const stock of this._stocks.values()) {
      total += stock.onHand;
    }
    return total;
  }

  public assignBinLocation(warehouseId: string, binLocation: BinLocation): void {
    const stock = this.getOrCreateStock(warehouseId);
    const exists = stock.binLocations?.some((b) => b.isSameLocation(binLocation));
    if (!exists) {
      stock.binLocations = [...(stock.binLocations ?? []), binLocation];
      this._version++;
    }
  }

  public removeBinLocation(warehouseId: string, binCode: string): void {
    const stock = this._stocks.get(warehouseId);
    const cleanCode = binCode.trim().toUpperCase();
    const current = stock?.binLocations ?? [];
    if (!current.some((b) => b.code === cleanCode)) {
      throw new BinLocationNotFoundError(cleanCode, this.id, warehouseId);
    }
    stock!.binLocations = current.filter((b) => b.code !== cleanCode);
    this._version++;
  }

  public getBinLocations(warehouseId: string): readonly BinLocation[] {
    return this._stocks.get(warehouseId)?.binLocations ?? [];
  }

  public getWarehouseStock(warehouseId: string): Readonly<WarehouseStockData> | undefined {
    return this._stocks.get(warehouseId);
  }

  public getOnHandStock(warehouseId: string): number {
    return this._stocks.get(warehouseId)?.onHand ?? 0;
  }

  public getReservedStock(warehouseId: string): number {
    return this._stocks.get(warehouseId)?.reserved ?? 0;
  }

  public getInTransitStock(warehouseId: string): number {
    return this._stocks.get(warehouseId)?.inTransit ?? 0;
  }

  public getAvailableStock(warehouseId: string): number {
    const stock = this._stocks.get(warehouseId);
    if (!stock) return 0;
    return Math.max(0, stock.onHand - stock.reserved);
  }

  public isLowStock(warehouseId: string): boolean {
    const avail = this.getAvailableStock(warehouseId);
    const rules = this.getReorderRules(warehouseId);
    return avail <= rules.reorderPoint;
  }

  public isOutOfStock(warehouseId: string): boolean {
    return this.getAvailableStock(warehouseId) <= 0;
  }

  /**
   * Entrada de mercancía al almacén (Recepción por compras, saldos iniciales o producción).
   */
  public receiveStock(params: {
    movementId: string;
    warehouseId: string;
    quantity: number;
    unitCost: Money;
    referenceId?: string;
    lotProps?: Omit<BatchLotProps, 'costPerUnit'>;
    serials?: string[];
    binLocation?: BinLocation;
    performedBy: UserSummary;
    authorizedBy?: UserSummary;
    notes?: string;
    idempotencyKey?: string;
    receivedAt?: Date;
    movementType?: StockMovementType;
  }): { movement: StockMovement } {
    if (params.quantity <= 0) {
      throw new Error('La cantidad a ingresar debe ser mayor a cero.');
    }

    const stock = this.getOrCreateStock(params.warehouseId);
    const balanceBefore = stock.onHand;
    const totalOnHandBefore = this.getTotalOnHandStock();
    const receivedAt = params.receivedAt ?? new Date();

    if (totalOnHandBefore > 0 && this.averageCost.currency !== params.unitCost.currency) {
      throw new CurrencyMismatchError(this.averageCost.currency, params.unitCost.currency);
    }

    if (params.binLocation) {
      const exists = stock.binLocations?.some((b) => b.isSameLocation(params.binLocation!));
      if (!exists) {
        stock.binLocations = [...(stock.binLocations ?? []), params.binLocation];
      }
    }

    // 1. Recálculo contable de costo (CMP global multi-bodega o FIFO Layer)
    if (this.valuationMethod === 'WEIGHTED_AVERAGE') {
      const totalStockAfter = totalOnHandBefore + params.quantity;
      if (totalOnHandBefore <= 0) {
        if (totalStockAfter > 0) {
          this.averageCost = params.unitCost;
        } else if (this.averageCost.toCents() === 0) {
          this.averageCost = Money.zero(params.unitCost.currency);
        }
      } else {
        const currentValuationCents = this.averageCost.toCents() * totalOnHandBefore;
        const incomingValuationCents = params.unitCost.toCents() * params.quantity;
        const newAverageCents = roundHalfEven((currentValuationCents + incomingValuationCents) / totalStockAfter);
        this.averageCost = Money.fromCents(newAverageCents, params.unitCost.currency);
      }
    } else if (totalOnHandBefore === 0 && this.averageCost.isZero()) {
      this.averageCost = Money.zero(params.unitCost.currency);
    }

    // 2. FIFO: Añadir capa contable
    const layer = new InventoryLayer({
      id: generateInventoryId('layer'),
      receivedAt,
      quantity: params.quantity,
      remainingQuantity: params.quantity,
      unitCost: params.unitCost,
      referenceId: params.referenceId,
    });
    stock.layers.push(layer);

    // 3. Manejo de Lotes (FEFO)
    if (this.trackingType === 'BATCH_LOT' && params.lotProps) {
      const existingLotIndex = stock.lots.findIndex((l) => l.lotNumber === params.lotProps!.lotNumber);
      if (existingLotIndex >= 0) {
        stock.lots[existingLotIndex] = stock.lots[existingLotIndex].add(params.quantity);
      } else {
        const newLot = new BatchLot({
          ...params.lotProps,
          costPerUnit: params.unitCost,
        });
        stock.lots.push(newLot);
      }
    }

    // 4. Manejo de Números de Serie
    if (this.trackingType === 'SERIAL' && params.serials && params.serials.length > 0) {
      if (params.serials.length !== params.quantity) {
        throw new Error(
          `La cantidad recibida (${params.quantity}) debe coincidir exactamente con el número de seriales proporcionados (${params.serials.length}).`
        );
      }
      for (const s of params.serials) {
        const exists = stock.serials.some((ser) => ser.serialNumber === s);
        if (exists) {
          throw new DuplicateSerialNumberError(s, this.id);
        }
        stock.serials.push(
          new SerialNumber({
            serialNumber: s,
            warehouseId: params.warehouseId,
            cost: params.unitCost,
            registeredAt: receivedAt,
            referenceId: params.referenceId,
          })
        );
      }
    }

    // 5. Actualizar existencia física
    stock.onHand += params.quantity;
    const balanceAfter = stock.onHand;
    this._version++;

    const totalCost = params.unitCost.multiply(params.quantity);
    const movement = new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.warehouseId,
      type: params.movementType ?? StockMovementType.PURCHASE_RECEIPT,
      quantity: params.quantity,
      balanceBefore,
      balanceAfter,
      unitCost: params.unitCost,
      totalCost,
      referenceId: params.referenceId,
      lotNumber: params.lotProps?.lotNumber,
      serialNumbers: params.serials,
      performedBy: params.performedBy,
      authorizedBy: params.authorizedBy,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      createdAt: receivedAt,
    });

    this.addEvent({
      eventId: generateInventoryId('evt'),
      eventName: 'StockReceivedEvent',
      aggregateId: this.id,
      occurredAt: receivedAt,
      payload: {
        itemId: this.id,
        warehouseId: params.warehouseId,
        quantity: params.quantity,
        unitCostCents: params.unitCost.toCents(),
        currency: params.unitCost.currency,
        newOnHandStock: balanceAfter,
        referenceId: params.referenceId,
        lotNumber: params.lotProps?.lotNumber,
      } as StockReceivedPayload,
    });

    return { movement };
  }

  /**
   * Salida de mercancía (Venta, consumo, despacho).
   */
  public dispatchStock(params: {
    movementId: string;
    warehouseId: string;
    quantity: number;
    referenceId?: string;
    lotNumber?: string;
    serialNumbers?: string[];
    allowNegativeStock?: boolean;
    performedBy: UserSummary;
    notes?: string;
    idempotencyKey?: string;
    dispatchedAt?: Date;
    movementType?: StockMovementType;
  }): { movement: StockMovement; totalCost: Money } {
    if (params.quantity <= 0) {
      throw new Error('La cantidad a despachar debe ser mayor a cero.');
    }

    const stock = this.getOrCreateStock(params.warehouseId);
    const balanceBefore = stock.onHand;
    const dispatchedAt = params.dispatchedAt ?? new Date();

    // Validación de stock disponible
    if (stock.onHand < params.quantity && !params.allowNegativeStock) {
      throw new NegativeStockNotAllowedError(this.id, params.warehouseId, stock.onHand, params.quantity);
    }

    // 1. Manejo y deducción de Lotes (FEFO)
    let selectedLotNumber = params.lotNumber;
    if (this.trackingType === 'BATCH_LOT') {
      if (selectedLotNumber) {
        const lotIndex = stock.lots.findIndex((l) => l.lotNumber === selectedLotNumber);
        if (lotIndex === -1) {
          throw new LotNotFoundError(selectedLotNumber, this.id);
        }
        stock.lots[lotIndex] = stock.lots[lotIndex].deduct(params.quantity, dispatchedAt);
      } else {
        // Rotación FEFO automática: ordenar lotes activos por fecha de vencimiento ascendente
        const activeLots = stock.lots
          .filter((l) => l.isAvailableForDispatch(dispatchedAt))
          .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());

        let remainingToDeduct = params.quantity;
        for (const lot of activeLots) {
          if (remainingToDeduct <= 0) break;
          const lotIdx = stock.lots.findIndex((l) => l.lotNumber === lot.lotNumber);
          const takeFromLot = Math.min(stock.lots[lotIdx].currentQuantity, remainingToDeduct);
          stock.lots[lotIdx] = stock.lots[lotIdx].deduct(takeFromLot, dispatchedAt);
          remainingToDeduct -= takeFromLot;
          if (!selectedLotNumber) selectedLotNumber = lot.lotNumber;
        }

        if (remainingToDeduct > 0 && !params.allowNegativeStock) {
          throw new InsufficientStockError(this.id, params.warehouseId, stock.onHand, params.quantity);
        }
      }
    }

    // 2. Manejo de Números de Serie
    if (this.trackingType === 'SERIAL') {
      if (!params.serialNumbers || params.serialNumbers.length !== params.quantity) {
        throw new Error(
          `Debe especificar exactamente ${params.quantity} número(s) de serie válidos para realizar el despacho.`
        );
      }
      for (const s of params.serialNumbers) {
        const serialIdx = stock.serials.findIndex((ser) => ser.serialNumber === s);
        if (serialIdx === -1) {
          throw new SerialNumberNotFoundError(s, this.id);
        }
        const currentSerial = stock.serials[serialIdx];
        if (!currentSerial.isAvailable() && currentSerial.status !== 'RESERVED') {
          throw new InvalidSerialNumberStateError(s, currentSerial.status, 'IN_STOCK');
        }
        stock.serials[serialIdx] = currentSerial.markAsSold(params.referenceId ?? params.movementId);
      }
    }

    // 3. Cálculo de Costo (FIFO por capas o CMP)
    let totalCostCents = 0;
    const currency = this.averageCost.currency;

    if (this.valuationMethod === 'FIFO') {
      let needed = params.quantity;
      for (let i = 0; i < stock.layers.length; i++) {
        if (needed <= 0) break;
        const layer = stock.layers[i];
        if (layer.isDepleted()) continue;

        const { updatedLayer, deducted } = layer.deduct(needed);
        stock.layers[i] = updatedLayer;
        totalCostCents += deducted * layer.unitCost.toCents();
        needed -= deducted;
      }
      // Si faltó stock en capas (ej. stock negativo), valorizar al costo promedio
      if (needed > 0) {
        totalCostCents += needed * this.averageCost.toCents();
      }
    } else {
      // CMP
      totalCostCents = Math.round(params.quantity * this.averageCost.toCents());
    }

    const totalCost = Money.fromCents(totalCostCents, currency);
    const unitCost = params.quantity > 0 ? Money.fromCents(Math.round(totalCostCents / params.quantity), currency) : this.averageCost;

    // 4. Actualizar existencia física
    stock.onHand -= params.quantity;
    const balanceAfter = stock.onHand;
    this._version++;

    const movement = new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.warehouseId,
      type: params.movementType ?? StockMovementType.SALE_DISPATCH,
      quantity: params.quantity,
      balanceBefore,
      balanceAfter,
      unitCost,
      totalCost,
      referenceId: params.referenceId,
      lotNumber: selectedLotNumber,
      serialNumbers: params.serialNumbers,
      performedBy: params.performedBy,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      createdAt: dispatchedAt,
    });

    this.addEvent({
      eventId: generateInventoryId('evt'),
      eventName: 'StockDispatchedEvent',
      aggregateId: this.id,
      occurredAt: dispatchedAt,
      payload: {
        itemId: this.id,
        warehouseId: params.warehouseId,
        quantity: params.quantity,
        totalCostCents: totalCost.toCents(),
        currency,
        remainingOnHandStock: balanceAfter,
        referenceId: params.referenceId,
        lotNumber: selectedLotNumber,
        serialNumbers: params.serialNumbers,
      } as StockDispatchedPayload,
    });

    // 5. Alertas de Stock Bajo / Agotado
    const available = this.getAvailableStock(params.warehouseId);
    const rules = this.getReorderRules(params.warehouseId);
    if (available <= 0) {
      this.addEvent({
        eventId: generateInventoryId('evt-out'),
        eventName: 'OutOfStockAlertTriggeredEvent',
        aggregateId: this.id,
        occurredAt: dispatchedAt,
        payload: { itemId: this.id, warehouseId: params.warehouseId } as OutOfStockAlertPayload,
      });
    } else if (available <= rules.reorderPoint) {
      this.addEvent({
        eventId: generateInventoryId('evt-low'),
        eventName: 'LowStockAlertTriggeredEvent',
        aggregateId: this.id,
        occurredAt: dispatchedAt,
        payload: {
          itemId: this.id,
          warehouseId: params.warehouseId,
          currentAvailable: available,
          minStock: rules.minStock,
          reorderPoint: rules.reorderPoint,
        } as LowStockAlertPayload,
      });
    }

    return { movement, totalCost };
  }

  /**
   * Reserva temporal de unidades (apartado con TTL).
   */
  public reserveStock(params: {
    reservationId: string;
    warehouseId: string;
    quantity: number;
    referenceId: string;
    ttlSeconds?: number;
    serialNumbers?: string[];
  }): StockReservation {
    const stock = this.getOrCreateStock(params.warehouseId);
    const available = stock.onHand - stock.reserved;

    if (available < params.quantity) {
      throw new InsufficientStockError(this.id, params.warehouseId, Math.max(0, available), params.quantity);
    }

    const ttl = params.ttlSeconds ?? 900; // 15 minutos por defecto
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Si tiene seriales, marcarlos como reservados
    if (this.trackingType === 'SERIAL' && params.serialNumbers) {
      for (const s of params.serialNumbers) {
        const idx = stock.serials.findIndex((ser) => ser.serialNumber === s);
        if (idx === -1) throw new SerialNumberNotFoundError(s, this.id);
        stock.serials[idx] = stock.serials[idx].markAsReserved(params.reservationId);
      }
    }

    stock.reserved += params.quantity;
    this._version++;

    const reservation = new StockReservation({
      id: params.reservationId,
      itemId: this.id,
      warehouseId: params.warehouseId,
      quantity: params.quantity,
      referenceId: params.referenceId,
      expiresAt,
      serialNumbers: params.serialNumbers,
    });

    this.addEvent({
      eventId: generateInventoryId('evt-res'),
      eventName: 'StockReservedEvent',
      aggregateId: this.id,
      occurredAt: new Date(),
      payload: {
        reservationId: params.reservationId,
        itemId: this.id,
        warehouseId: params.warehouseId,
        quantity: params.quantity,
        referenceId: params.referenceId,
        expiresAt,
      } as StockReservedPayload,
    });

    return reservation;
  }

  /**
   * Libera una reserva temporal previamente apartada.
   */
  public releaseReservation(params: {
    warehouseId: string;
    quantity: number;
    reservationId: string;
    serialNumbers?: string[];
    reason?: 'EXPIRED' | 'CANCELLED' | 'MANUAL';
  }): void {
    const stock = this.getOrCreateStock(params.warehouseId);
    stock.reserved = Math.max(0, stock.reserved - params.quantity);

    if (this.trackingType === 'SERIAL' && params.serialNumbers) {
      for (const s of params.serialNumbers) {
        const idx = stock.serials.findIndex((ser) => ser.serialNumber === s);
        if (idx >= 0 && stock.serials[idx].status === 'RESERVED') {
          stock.serials[idx] = stock.serials[idx].returnToStock();
        }
      }
    }

    this._version++;

    this.addEvent({
      eventId: generateInventoryId('evt-rel'),
      eventName: 'ReservationReleasedEvent',
      aggregateId: this.id,
      occurredAt: new Date(),
      payload: {
        reservationId: params.reservationId,
        itemId: this.id,
        warehouseId: params.warehouseId,
        quantity: params.quantity,
        reason: params.reason ?? 'MANUAL',
      } as ReservationReleasedPayload,
    });
  }

  /**
   * Confirma una reserva convirtiéndola en despacho físico de inventario.
   */
  public commitReservation(params: {
    movementId: string;
    warehouseId: string;
    quantity: number;
    reservationId: string;
    referenceId?: string;
    serialNumbers?: string[];
    performedBy: UserSummary;
    notes?: string;
    idempotencyKey?: string;
  }): { movement: StockMovement; totalCost: Money } {
    // 1. Liberar la cantidad reservada
    this.releaseReservation({
      warehouseId: params.warehouseId,
      quantity: params.quantity,
      reservationId: params.reservationId,
      serialNumbers: params.serialNumbers,
      reason: 'MANUAL',
    });

    // 2. Realizar el despacho físico
    const dispatchResult = this.dispatchStock({
      movementId: params.movementId,
      warehouseId: params.warehouseId,
      quantity: params.quantity,
      referenceId: params.referenceId ?? params.reservationId,
      serialNumbers: params.serialNumbers,
      performedBy: params.performedBy,
      notes: params.notes ?? `Despacho por confirmación de reserva ${params.reservationId}`,
      idempotencyKey: params.idempotencyKey,
      movementType: StockMovementType.SALE_DISPATCH,
    });

    this.addEvent({
      eventId: generateInventoryId('evt-cmt'),
      eventName: 'ReservationCommittedEvent',
      aggregateId: this.id,
      occurredAt: new Date(),
      payload: {
        reservationId: params.reservationId,
        itemId: this.id,
        warehouseId: params.warehouseId,
        quantity: params.quantity,
        referenceId: params.referenceId ?? params.reservationId,
      } as ReservationCommittedPayload,
    });

    return dispatchResult;
  }

  /**
   * Ajuste directo de inventario (merma, rotura, robo, sobrante o arqueo físico).
   */
  public adjustStock(params: {
    movementId: string;
    warehouseId: string;
    deltaQuantity: number;
    reason: string;
    unitCost?: Money;
    lotNumber?: string;
    lotProps?: Omit<BatchLotProps, 'costPerUnit'>;
    serialNumbers?: string[];
    performedBy: UserSummary;
    authorizedBy?: UserSummary;
    notes?: string;
    idempotencyKey?: string;
    allowNegativeStock?: boolean;
  }): StockMovement {
    const stock = this.getOrCreateStock(params.warehouseId);
    const balanceBefore = stock.onHand;
    const isIncrease = params.deltaQuantity > 0;
    const absQty = Math.abs(params.deltaQuantity);
    const cost = params.unitCost ?? this.averageCost;
    const now = new Date();

    if (!isIncrease && stock.onHand < absQty && !params.allowNegativeStock) {
      throw new NegativeStockNotAllowedError(this.id, params.warehouseId, stock.onHand, absQty);
    }

    // Sincronización de Lotes en ajustes
    if (this.trackingType === 'BATCH_LOT') {
      if (isIncrease) {
        const targetLotNumber = params.lotProps?.lotNumber ?? params.lotNumber;
        if (targetLotNumber) {
          const lotIdx = stock.lots.findIndex((l) => l.lotNumber === targetLotNumber);
          if (lotIdx >= 0) {
            stock.lots[lotIdx] = stock.lots[lotIdx].add(absQty);
          } else if (params.lotProps) {
            stock.lots.push(new BatchLot({ ...params.lotProps, costPerUnit: cost }));
          }
        }
      } else {
        if (params.lotNumber) {
          const lotIdx = stock.lots.findIndex((l) => l.lotNumber === params.lotNumber);
          if (lotIdx === -1) {
            throw new LotNotFoundError(params.lotNumber, this.id);
          }
          stock.lots[lotIdx] = stock.lots[lotIdx].deduct(absQty, now);
        } else if (stock.lots.length > 0) {
          const activeLots = stock.lots
            .filter((l) => l.isAvailableForDispatch(now))
            .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
          let remaining = absQty;
          for (const lot of activeLots) {
            if (remaining <= 0) break;
            const idx = stock.lots.findIndex((l) => l.lotNumber === lot.lotNumber);
            const take = Math.min(stock.lots[idx].currentQuantity, remaining);
            stock.lots[idx] = stock.lots[idx].deduct(take, now);
            remaining -= take;
          }
        }
      }
    }

    // Sincronización de Números de Serie en ajustes
    if (this.trackingType === 'SERIAL' && params.serialNumbers && params.serialNumbers.length > 0) {
      if (params.serialNumbers.length !== absQty) {
        throw new Error(
          `La cantidad del ajuste (${absQty}) debe coincidir con los números de serie proporcionados (${params.serialNumbers.length}).`
        );
      }
      if (isIncrease) {
        for (const s of params.serialNumbers) {
          if (stock.serials.some((ser) => ser.serialNumber === s)) {
            throw new DuplicateSerialNumberError(s, this.id);
          }
          stock.serials.push(
            new SerialNumber({
              serialNumber: s,
              warehouseId: params.warehouseId,
              cost,
              registeredAt: now,
              referenceId: params.reason,
            })
          );
        }
      } else {
        for (const s of params.serialNumbers) {
          const idx = stock.serials.findIndex((ser) => ser.serialNumber === s);
          if (idx === -1) {
            throw new SerialNumberNotFoundError(s, this.id);
          }
          stock.serials[idx] = stock.serials[idx].markAsDamaged(params.reason);
        }
      }
    }

    if (isIncrease) {
      stock.onHand += absQty;
      stock.layers.push(
        new InventoryLayer({
          id: generateInventoryId('layer'),
          receivedAt: now,
          quantity: absQty,
          remainingQuantity: absQty,
          unitCost: cost,
          referenceId: params.reason,
        })
      );
    } else {
      stock.onHand -= absQty;
      let needed = absQty;
      for (let i = 0; i < stock.layers.length; i++) {
        if (needed <= 0) break;
        if (!stock.layers[i].isDepleted()) {
          const { updatedLayer, deducted } = stock.layers[i].deduct(needed);
          stock.layers[i] = updatedLayer;
          needed -= deducted;
        }
      }
    }

    const balanceAfter = stock.onHand;
    this._version++;

    const totalCost = cost.multiply(absQty);
    const movement = new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.warehouseId,
      type: isIncrease ? StockMovementType.ADJUSTMENT_INCREASE : StockMovementType.ADJUSTMENT_DECREASE,
      quantity: absQty,
      balanceBefore,
      balanceAfter,
      unitCost: cost,
      totalCost,
      referenceId: params.reason,
      lotNumber: params.lotProps?.lotNumber ?? params.lotNumber,
      serialNumbers: params.serialNumbers,
      performedBy: params.performedBy,
      authorizedBy: params.authorizedBy,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      createdAt: now,
    });

    this.addEvent({
      eventId: generateInventoryId('evt-adj'),
      eventName: 'StockAdjustedEvent',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        itemId: this.id,
        warehouseId: params.warehouseId,
        deltaQuantity: params.deltaQuantity,
        reason: params.reason,
        previousStock: balanceBefore,
        newStock: balanceAfter,
        performedBy: params.performedBy.id,
        authorizedBy: params.authorizedBy?.id,
      } as StockAdjustedPayload,
    });

    return movement;
  }

  /**
   * Salida por inicio de traslado entre bodegas (pasa stock de onHand a inTransit).
   * Soporta lotes, números de serie y consumo de capas FIFO reales en origen.
   */
  public transferOut(params: {
    movementId: string;
    fromWarehouseId: string;
    toWarehouseId?: string;
    quantity: number;
    transferId: string;
    lotNumber?: string;
    serialNumbers?: string[];
    performedBy: UserSummary;
  }): StockMovement {
    const stock = this.getOrCreateStock(params.fromWarehouseId);
    if (stock.onHand < params.quantity) {
      throw new InsufficientStockError(this.id, params.fromWarehouseId, stock.onHand, params.quantity);
    }

    const now = new Date();
    let selectedLotNumber = params.lotNumber;

    // 1. Lotes en origen
    if (this.trackingType === 'BATCH_LOT') {
      if (selectedLotNumber) {
        const lotIdx = stock.lots.findIndex((l) => l.lotNumber === selectedLotNumber);
        if (lotIdx === -1) throw new LotNotFoundError(selectedLotNumber, this.id);
        stock.lots[lotIdx] = stock.lots[lotIdx].deduct(params.quantity, now);
      } else {
        const activeLots = stock.lots
          .filter((l) => l.isAvailableForDispatch(now))
          .sort((a, b) => a.expirationDate.getTime() - b.expirationDate.getTime());
        let remaining = params.quantity;
        for (const lot of activeLots) {
          if (remaining <= 0) break;
          const idx = stock.lots.findIndex((l) => l.lotNumber === lot.lotNumber);
          const take = Math.min(stock.lots[idx].currentQuantity, remaining);
          stock.lots[idx] = stock.lots[idx].deduct(take, now);
          remaining -= take;
          if (!selectedLotNumber) selectedLotNumber = lot.lotNumber;
        }
        if (remaining > 0) {
          throw new InsufficientStockError(this.id, params.fromWarehouseId, stock.onHand, params.quantity);
        }
      }
    }

    // 2. Seriales en origen
    if (this.trackingType === 'SERIAL') {
      if (!params.serialNumbers || params.serialNumbers.length !== params.quantity) {
        throw new Error(
          `Debe especificar exactamente ${params.quantity} número(s) de serie para trasladar.`
        );
      }
      for (const s of params.serialNumbers) {
        const idx = stock.serials.findIndex((ser) => ser.serialNumber === s);
        if (idx === -1) throw new SerialNumberNotFoundError(s, this.id);
        stock.serials[idx] = stock.serials[idx].markAsInTransit(params.transferId);
      }
    }

    // 3. Costeo FIFO o CMP
    const currency = this.averageCost.currency;
    let totalCostCents = 0;
    if (this.valuationMethod === 'FIFO') {
      let needed = params.quantity;
      for (let i = 0; i < stock.layers.length; i++) {
        if (needed <= 0) break;
        const layer = stock.layers[i];
        if (layer.isDepleted()) continue;
        const { updatedLayer, deducted } = layer.deduct(needed);
        stock.layers[i] = updatedLayer;
        totalCostCents += deducted * layer.unitCost.toCents();
        needed -= deducted;
      }
      if (needed > 0) {
        totalCostCents += needed * this.averageCost.toCents();
      }
    } else {
      totalCostCents = Math.round(params.quantity * this.averageCost.toCents());
    }

    const totalCost = Money.fromCents(totalCostCents, currency);
    const unitCost = params.quantity > 0
      ? Money.fromCents(roundHalfEven(totalCostCents / params.quantity), currency)
      : this.averageCost;

    const balanceBefore = stock.onHand;
    stock.onHand -= params.quantity;
    stock.inTransit += params.quantity;
    const balanceAfter = stock.onHand;
    this._version++;

    this.addEvent({
      eventId: generateInventoryId('evt-trf-out'),
      eventName: 'StockTransferredEvent',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        transferId: params.transferId,
        itemId: this.id,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId ?? '',
        quantitySent: params.quantity,
        quantityReceived: 0,
        status: 'IN_TRANSIT',
      } as StockTransferredPayload,
    });

    return new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.fromWarehouseId,
      type: StockMovementType.TRANSFER_OUT,
      quantity: params.quantity,
      balanceBefore,
      balanceAfter,
      unitCost,
      totalCost,
      referenceId: params.transferId,
      lotNumber: selectedLotNumber,
      serialNumbers: params.serialNumbers,
      performedBy: params.performedBy,
      createdAt: now,
    });
  }

  /**
   * Entrada por recepción de traslado en bodega destino.
   */
  public transferIn(params: {
    movementId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantitySent: number;
    quantityReceived: number;
    transferId: string;
    unitCost?: Money;
    lotProps?: Omit<BatchLotProps, 'costPerUnit'>;
    lotNumber?: string;
    serialNumbers?: string[];
    performedBy: UserSummary;
  }): StockMovement {
    const fromStock = this.getOrCreateStock(params.fromWarehouseId);
    const toStock = this.getOrCreateStock(params.toWarehouseId);
    const now = new Date();
    const effectiveUnitCost = params.unitCost ?? this.averageCost;

    fromStock.inTransit = Math.max(0, fromStock.inTransit - params.quantitySent);
    const balanceBefore = toStock.onHand;
    toStock.onHand += params.quantityReceived;
    const balanceAfter = toStock.onHand;

    // Lotes en destino
    const targetLotNumber = params.lotProps?.lotNumber ?? params.lotNumber;
    if (this.trackingType === 'BATCH_LOT' && targetLotNumber && params.quantityReceived > 0) {
      const destIdx = toStock.lots.findIndex((l) => l.lotNumber === targetLotNumber);
      if (destIdx >= 0) {
        toStock.lots[destIdx] = toStock.lots[destIdx].add(params.quantityReceived);
      } else if (params.lotProps) {
        toStock.lots.push(
          new BatchLot({
            ...params.lotProps,
            initialQuantity: params.quantityReceived,
            currentQuantity: params.quantityReceived,
            costPerUnit: effectiveUnitCost,
          })
        );
      } else {
        const originLot = fromStock.lots.find((l) => l.lotNumber === targetLotNumber);
        if (originLot) {
          toStock.lots.push(
            new BatchLot({
              lotNumber: originLot.lotNumber,
              expirationDate: originLot.expirationDate,
              manufacturingDate: originLot.manufacturingDate,
              status: originLot.status,
              initialQuantity: params.quantityReceived,
              currentQuantity: params.quantityReceived,
              costPerUnit: effectiveUnitCost,
            })
          );
        }
      }
    }

    // Seriales en destino
    if (this.trackingType === 'SERIAL' && params.serialNumbers && params.serialNumbers.length > 0) {
      const receivedSerials = params.serialNumbers.slice(0, params.quantityReceived);
      for (const s of receivedSerials) {
        const originIdx = fromStock.serials.findIndex((ser) => ser.serialNumber === s);
        if (originIdx >= 0) {
          const moved = fromStock.serials[originIdx].returnToStock(params.toWarehouseId);
          fromStock.serials.splice(originIdx, 1);
          toStock.serials.push(moved);
        } else {
          toStock.serials.push(
            new SerialNumber({
              serialNumber: s,
              warehouseId: params.toWarehouseId,
              cost: effectiveUnitCost,
              registeredAt: now,
              referenceId: params.transferId,
            })
          );
        }
      }
    }

    // Agregar capa contable en destino
    toStock.layers.push(
      new InventoryLayer({
        id: generateInventoryId('layer-trf'),
        receivedAt: now,
        quantity: params.quantityReceived,
        remainingQuantity: params.quantityReceived,
        unitCost: effectiveUnitCost,
        referenceId: params.transferId,
      })
    );

    this._version++;

    const status = params.quantityReceived === params.quantitySent ? 'COMPLETED' : 'DISCREPANCY';
    this.addEvent({
      eventId: generateInventoryId('evt-trf-in'),
      eventName: 'StockTransferredEvent',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        transferId: params.transferId,
        itemId: this.id,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        quantitySent: params.quantitySent,
        quantityReceived: params.quantityReceived,
        status,
      } as StockTransferredPayload,
    });

    return new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.toWarehouseId,
      type: StockMovementType.TRANSFER_IN,
      quantity: params.quantityReceived,
      balanceBefore,
      balanceAfter,
      unitCost: effectiveUnitCost,
      totalCost: effectiveUnitCost.multiply(params.quantityReceived),
      referenceId: params.transferId,
      lotNumber: targetLotNumber,
      serialNumbers: params.serialNumbers,
      performedBy: params.performedBy,
      createdAt: now,
    });
  }

  /**
   * Revierte un traslado en tránsito hacia el almacén de origen.
   */
  public cancelTransferOut(params: {
    movementId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    transferId: string;
    lotNumber?: string;
    serialNumbers?: string[];
    unitCost?: Money;
    reason: string;
    performedBy: UserSummary;
  }): StockMovement {
    const stock = this.getOrCreateStock(params.fromWarehouseId);
    const now = new Date();
    const effectiveUnitCost = params.unitCost ?? this.averageCost;

    stock.inTransit = Math.max(0, stock.inTransit - params.quantity);
    const balanceBefore = stock.onHand;
    stock.onHand += params.quantity;
    const balanceAfter = stock.onHand;

    if (this.trackingType === 'BATCH_LOT' && params.lotNumber) {
      const lotIdx = stock.lots.findIndex((l) => l.lotNumber === params.lotNumber);
      if (lotIdx >= 0) {
        stock.lots[lotIdx] = stock.lots[lotIdx].add(params.quantity);
      }
    }

    if (this.trackingType === 'SERIAL' && params.serialNumbers) {
      for (const s of params.serialNumbers) {
        const idx = stock.serials.findIndex((ser) => ser.serialNumber === s);
        if (idx >= 0 && stock.serials[idx].status === 'IN_TRANSIT') {
          stock.serials[idx] = stock.serials[idx].returnToStock(params.fromWarehouseId);
        }
      }
    }

    stock.layers.push(
      new InventoryLayer({
        id: generateInventoryId('layer-trf-cancel'),
        receivedAt: now,
        quantity: params.quantity,
        remainingQuantity: params.quantity,
        unitCost: effectiveUnitCost,
        referenceId: params.transferId,
      })
    );

    this._version++;

    this.addEvent({
      eventId: generateInventoryId('evt-trf-can'),
      eventName: 'StockTransferredEvent',
      aggregateId: this.id,
      occurredAt: now,
      payload: {
        transferId: params.transferId,
        itemId: this.id,
        fromWarehouseId: params.fromWarehouseId,
        toWarehouseId: params.toWarehouseId,
        quantitySent: params.quantity,
        quantityReceived: 0,
        status: 'CANCELLED',
      } as StockTransferredPayload,
    });

    return new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.fromWarehouseId,
      type: StockMovementType.TRANSFER_IN,
      quantity: params.quantity,
      balanceBefore,
      balanceAfter,
      unitCost: effectiveUnitCost,
      totalCost: effectiveUnitCost.multiply(params.quantity),
      referenceId: params.transferId,
      lotNumber: params.lotNumber,
      serialNumbers: params.serialNumbers,
      performedBy: params.performedBy,
      notes: `Cancelación de traslado ${params.transferId}: ${params.reason}`,
      createdAt: now,
    });
  }

  /**
   * Cambia el estado de un lote a QUARANTINED o lo libera a ACTIVE.
   */
  public setLotStatus(params: {
    warehouseId: string;
    lotNumber: string;
    status: LotStatus;
    reason?: string;
  }): BatchLot {
    const stock = this.getOrCreateStock(params.warehouseId);
    const idx = stock.lots.findIndex((l) => l.lotNumber === params.lotNumber);
    if (idx === -1) {
      throw new LotNotFoundError(params.lotNumber, this.id);
    }

    const currentLot = stock.lots[idx];
    if ((currentLot.status === 'EXPIRED' || currentLot.status === 'RECALLED') && params.status === 'ACTIVE') {
      throw new SchemaValidationError(
        'BatchLot',
        `No se puede reactivar a ACTIVE el lote '${params.lotNumber}' en estado '${currentLot.status}'.`
      );
    }

    const updated = currentLot.withStatus(params.status);
    stock.lots[idx] = updated;
    this._version++;

    if (params.status === 'QUARANTINED' || params.status === 'ACTIVE' || params.status === 'EXPIRED') {
      this.addEvent({
        eventId: generateInventoryId('evt-lot'),
        eventName: 'LotQuarantinedEvent',
        aggregateId: this.id,
        occurredAt: new Date(),
        payload: {
          itemId: this.id,
          warehouseId: params.warehouseId,
          lotNumber: params.lotNumber,
          status: params.status,
          reason: params.reason,
        } as LotQuarantinedPayload,
      });
    }

    return updated;
  }

  /**
   * Da de baja formalmente un lote vencido o en cuarentena descontando su saldo disponible.
   */
  public writeOffLot(params: {
    movementId: string;
    warehouseId: string;
    lotNumber: string;
    reason: string;
    performedBy: UserSummary;
    authorizedBy?: UserSummary;
  }): StockMovement {
    const stock = this.getOrCreateStock(params.warehouseId);
    const idx = stock.lots.findIndex((l) => l.lotNumber === params.lotNumber);
    if (idx === -1) {
      throw new LotNotFoundError(params.lotNumber, this.id);
    }

    const lot = stock.lots[idx];
    const qtyToWriteOff = lot.currentQuantity;
    if (qtyToWriteOff <= 0) {
      throw new InsufficientStockError(this.id, params.warehouseId, 0, 1);
    }

    const unreservedOnHand = Math.max(0, stock.onHand - stock.reserved);
    if (qtyToWriteOff > unreservedOnHand) {
      throw new InsufficientStockError(this.id, params.warehouseId, unreservedOnHand, qtyToWriteOff);
    }

    const balanceBefore = stock.onHand;
    stock.onHand = Math.max(0, stock.onHand - qtyToWriteOff);
    stock.lots[idx] = lot.withStatus('EXPIRED');
    // Dejar en 0 la cantidad del lote dado de baja
    stock.lots[idx] = new BatchLot({
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate,
      manufacturingDate: lot.manufacturingDate,
      status: 'EXPIRED',
      initialQuantity: lot.initialQuantity,
      currentQuantity: 0,
      costPerUnit: lot.costPerUnit,
    });

    let needed = qtyToWriteOff;
    for (let i = 0; i < stock.layers.length; i++) {
      if (needed <= 0) break;
      if (!stock.layers[i].isDepleted()) {
        const { updatedLayer, deducted } = stock.layers[i].deduct(needed);
        stock.layers[i] = updatedLayer;
        needed -= deducted;
      }
    }

    const balanceAfter = stock.onHand;
    this._version++;

    const movement = new StockMovement({
      id: params.movementId,
      itemId: this.id,
      warehouseId: params.warehouseId,
      type: StockMovementType.ADJUSTMENT_DECREASE,
      quantity: qtyToWriteOff,
      balanceBefore,
      balanceAfter,
      unitCost: lot.costPerUnit,
      totalCost: lot.costPerUnit.multiply(qtyToWriteOff),
      referenceId: params.reason,
      lotNumber: lot.lotNumber,
      performedBy: params.performedBy,
      authorizedBy: params.authorizedBy,
      notes: `Baja de lote ${lot.lotNumber}: ${params.reason}`,
      createdAt: new Date(),
    });

    this.addEvent({
      eventId: generateInventoryId('evt-woff'),
      eventName: 'StockAdjustedEvent',
      aggregateId: this.id,
      occurredAt: new Date(),
      payload: {
        itemId: this.id,
        warehouseId: params.warehouseId,
        deltaQuantity: -qtyToWriteOff,
        reason: params.reason,
        previousStock: balanceBefore,
        newStock: balanceAfter,
        performedBy: params.performedBy.id,
        authorizedBy: params.authorizedBy?.id,
      } as StockAdjustedPayload,
    });

    return movement;
  }

  /**
   * Obtiene lotes próximos a vencer para prevención de mermas.
   */
  public getExpiringLots(
    warehouseId: string,
    daysThreshold: number = 30,
    referenceDate: Date = new Date()
  ): BatchLot[] {
    const stock = this._stocks.get(warehouseId);
    if (!stock) return [];
    return stock.lots.filter(
      (l) =>
        l.isAvailableForDispatch(referenceDate) &&
        l.daysUntilExpiration(referenceDate) <= daysThreshold &&
        l.daysUntilExpiration(referenceDate) >= 0
    );
  }

  /**
   * Obtiene lotes ya vencidos con saldo pendiente.
   */
  public getExpiredLots(warehouseId: string, referenceDate: Date = new Date()): BatchLot[] {
    const stock = this._stocks.get(warehouseId);
    if (!stock) return [];
    return stock.lots.filter((l) => l.currentQuantity > 0 && l.isExpired(referenceDate));
  }

  public toJSON(): InventoryItemJSON {
    const stocksJson: Record<string, WarehouseStockJSON> = {};
    for (const [whId, stock] of this._stocks.entries()) {
      stocksJson[whId] = {
        warehouseId: stock.warehouseId,
        onHand: stock.onHand,
        reserved: stock.reserved,
        inTransit: stock.inTransit,
        layers: stock.layers.map((l) => l.toJSON()),
        lots: stock.lots.map((l) => l.toJSON()),
        serials: stock.serials.map((s) => s.toJSON()),
        binLocations: stock.binLocations ? stock.binLocations.map((b) => b.toJSON()) : [],
      };
    }

    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      sku: this.sku,
      barcode: this.barcode,
      barcodes: [...this.barcodes],
      name: this.name,
      description: this.description,
      uom: this.uom.toJSON(),
      valuationMethod: this.valuationMethod,
      averageCost: this.averageCost.toJSON(),
      standardCost: this.standardCost?.toJSON(),
      reorderRules: { ...this.reorderRules },
      warehouseReorderRules:
        Object.keys(this.warehouseReorderRules).length > 0 ? { ...this.warehouseReorderRules } : undefined,
      trackingType: this.trackingType,
      stocks: stocksJson,
      version: this._version,
    };
  }

  public static fromJSON(raw: InventoryItemJSON | unknown): InventoryItem {
    const json = parseWithInventorySchema(InventoryItemJSONSchema, raw, 'InventoryItem');

    const stocksMap: Record<string, WarehouseStockData> = {};
    for (const [whId, stock] of Object.entries(json.stocks)) {
      stocksMap[whId] = {
        warehouseId: stock.warehouseId,
        onHand: stock.onHand,
        reserved: stock.reserved,
        inTransit: stock.inTransit,
        layers: stock.layers.map((l) => InventoryLayer.fromJSON(l)),
        lots: stock.lots.map((l) => BatchLot.fromJSON(l)),
        serials: stock.serials.map((s) => SerialNumber.fromJSON(s)),
        binLocations: stock.binLocations ? stock.binLocations.map((b) => BinLocation.fromJSON(b)) : [],
      };
    }

    return new InventoryItem({
      id: json.id,
      sku: json.sku,
      barcode: json.barcode,
      barcodes: json.barcodes,
      name: json.name,
      description: json.description,
      uom: UnitOfMeasure.fromJSON(json.uom),
      valuationMethod: json.valuationMethod,
      averageCost: Money.fromJSON(json.averageCost),
      standardCost: json.standardCost ? Money.fromJSON(json.standardCost) : undefined,
      reorderRules: json.reorderRules,
      warehouseReorderRules: json.warehouseReorderRules,
      trackingType: json.trackingType,
      stocks: stocksMap,
      version: json.version,
    });
  }
}

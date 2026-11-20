import {
  InsufficientCashInDrawerError,
  InsufficientChangeDenominationsError,
  InvalidPaymentError,
  ShiftNotFoundError,
} from '../domain/errors/cashier-errors.js';
import { CashMovement, MovementType, PaymentSettlement, TipDetails, UserSummary } from '../domain/entities/cash-movement.js';
import { CashLimitExceededEvent, CashMovementRecordedEvent } from '../domain/events/cashier-events.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { CashRoundingConfig, CashRoundingPolicy } from '../domain/value-objects/cash-rounding.js';
import { ExchangeRate } from '../domain/value-objects/exchange-rate.js';
import { Money } from '../domain/value-objects/money.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { CashShift } from '../domain/entities/cash-shift.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';
import { EventPublisher } from './open-shift.use-case.js';

export interface PaymentItemInput {
  id: string;
  method: PaymentMethod;
  amount?: number;
  reference?: string;
  exchangeRate?: ExchangeRate;
  foreignAmount?: number;
}

export interface TipInput {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  serverEmployeeId?: string;
  serverName?: string;
  reference?: string;
}

export interface ForeignTenderedInput {
  amount: number;
  exchangeRate: ExchangeRate;
}

export interface RecordPaymentDTO {
  shiftId: string;
  transactionReference: string;
  ticketTotal?: number;
  concept?: string;
  payments: PaymentItemInput[];
  tip?: TipInput; // Propina opcional recaudada en la transacción
  tenderedCash?: number;
  tenderedBreakdownCounts?: Record<number, number>;
  /** Efectivo físico entregado en moneda extranjera; se convierte a la moneda del turno y el vuelto se entrega en moneda base. */
  foreignTendered?: ForeignTenderedInput;
  /** Política de redondeo aplicable únicamente al componente en efectivo. */
  cashRounding?: CashRoundingPolicy | CashRoundingConfig;
  requireExactDenominations?: boolean;
  idempotencyKey?: string;
  performedBy: UserSummary;
}

export interface PaymentResult {
  movements: CashMovement[];
  ticketTotal: Money;
  totalPaid: Money;
  cashRequired: Money;
  changeGiven: Money;
  tenderedCash?: Money;
  roundingAdjustment?: Money;
  foreignTenderedAmount?: Money;
  foreignExchangeRate?: ExchangeRate;
  tipMovement?: CashMovement;
  optimalChangeBreakdown?: CashBreakdown;
  isCashLimitExceeded: boolean;
  /** true si la existencia física (billetes) de la gaveta fue actualizada con este cobro. */
  drawerStockUpdated: boolean;
  /** true si la solicitud ya había sido procesada (misma idempotencyKey): se devuelve el resultado original sin duplicar nada. */
  isReplay: boolean;
}

export interface RecordPaymentOptions {
  features?: CashierFeatureProfile;
}

/**
 * Caso de uso: Registrar cobro de ventas.
 * Soporta derivación automática de efectivo, pagos mixtos, cálculo de vuelto con Coin Change,
 * alertas de límites y propinas (tips) separadas contablemente del ingreso comercial.
 *
 * Garantías:
 *  - Idempotente: reintentar con la misma `idempotencyKey` devuelve el resultado original (sin duplicar movimientos
 *    ni alterar la existencia física de la gaveta).
 *  - Atómico: todos los movimientos y el cambio de billetes se validan y aplican como una sola transacción.
 */
export class RecordPaymentUseCase {
  private readonly features: CashierFeatureFlags;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly publishEvent?: EventPublisher,
    options: RecordPaymentOptions = {}
  ) {
    this.features = resolveCashierFeatures(options.features);
  }

  public async execute(dto: RecordPaymentDTO): Promise<PaymentResult> {
    const shift = await this.shiftRepo.findById(dto.shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(dto.shiftId);
    }

    // 0. Reintento idempotente: devolver el resultado original
    if (dto.idempotencyKey) {
      const existing = shift.findMovementsByIdempotencyRoot(dto.idempotencyKey);
      if (existing.length > 0) {
        return this.rebuildResult(shift, existing);
      }
    }

    shift.assertOperational();

    if (!dto.payments || dto.payments.length === 0) {
      throw new InvalidPaymentError('Debe especificar al menos un método de pago.');
    }

    if (dto.payments.length > 1) {
      assertFeatureEnabled(this.features, 'splitPayments');
    }
    if (dto.tip && dto.tip.amount > 0) {
      assertFeatureEnabled(this.features, 'tips');
    }
    if (dto.cashRounding) {
      assertFeatureEnabled(this.features, 'cashRounding');
    }
    if (dto.foreignTendered) {
      assertFeatureEnabled(this.features, 'multiCurrencyTendered');
    }
    if (dto.requireExactDenominations) {
      assertFeatureEnabled(this.features, 'optimalCoinChange');
    }
    if (dto.tenderedBreakdownCounts && Object.keys(dto.tenderedBreakdownCounts).length > 0) {
      assertFeatureEnabled(this.features, 'cashDenominationTracking');
    }

    // 1. Métodos no efectivo
    let nonCashCovered = Money.zero(shift.currency);
    const nonCashItems: Array<{
      input: PaymentItemInput;
      amount: Money;
      foreignMoney?: Money;
    }> = [];

    let explicitCashInput: PaymentItemInput | undefined;

    for (const p of dto.payments) {
      if (p.method === PaymentMethod.CASH) {
        if (explicitCashInput) {
          throw new InvalidPaymentError('No se puede especificar más de un pago en efectivo en la misma transacción.');
        }
        explicitCashInput = p;
        continue;
      }

      let itemMoney: Money;
      let foreignMoney: Money | undefined;

      if (p.exchangeRate && p.foreignAmount !== undefined) {
        foreignMoney = Money.fromDecimal(p.foreignAmount, p.exchangeRate.fromCurrency);
        itemMoney = p.exchangeRate.convertToBase(foreignMoney);
      } else if (p.amount !== undefined) {
        itemMoney = Money.fromDecimal(p.amount, shift.currency);
      } else {
        throw new InvalidPaymentError(`El monto para el método "${p.method}" es obligatorio.`);
      }

      if (!itemMoney.isPositive()) {
        throw new InvalidPaymentError(`El monto para "${p.method}" debe ser mayor a cero.`);
      }

      nonCashCovered = nonCashCovered.add(itemMoney);
      nonCashItems.push({ input: p, amount: itemMoney, foreignMoney });
    }

    // 2. Efectivo requerido y total ticket
    let ticketTotalMoney: Money;
    let cashRequired: Money;

    if (dto.ticketTotal !== undefined) {
      ticketTotalMoney = Money.fromDecimal(dto.ticketTotal, shift.currency);
      if (!ticketTotalMoney.isPositive()) {
        throw new InvalidPaymentError('El total del ticket debe ser un monto positivo.');
      }

      if (nonCashCovered.greaterThan(ticketTotalMoney)) {
        throw new InvalidPaymentError(
          `Los pagos no efectivo (${nonCashCovered.toString()}) exceden el total del ticket (${ticketTotalMoney.toString()}); los medios electrónicos no admiten vuelto.`
        );
      }

      cashRequired = ticketTotalMoney.subtract(nonCashCovered);
    } else {
      if (explicitCashInput?.exchangeRate && explicitCashInput.foreignAmount !== undefined) {
        const cashForeign = Money.fromDecimal(explicitCashInput.foreignAmount, explicitCashInput.exchangeRate.fromCurrency);
        cashRequired = explicitCashInput.exchangeRate.convertToBase(cashForeign);
        if (!cashRequired.isPositive()) {
          throw new InvalidPaymentError('El monto en efectivo debe ser mayor a cero.');
        }
      } else if (explicitCashInput && explicitCashInput.amount !== undefined) {
        cashRequired = Money.fromDecimal(explicitCashInput.amount, shift.currency);
        if (!cashRequired.isPositive()) {
          throw new InvalidPaymentError('El monto en efectivo debe ser mayor a cero.');
        }
      } else {
        cashRequired = Money.zero(shift.currency);
      }
      ticketTotalMoney = nonCashCovered.add(cashRequired);
      if (!ticketTotalMoney.isPositive()) {
        throw new InvalidPaymentError('Debe especificar el total del ticket o al menos un monto válido mayor a cero.');
      }
    }

    let roundingAdjustment = Money.zero(shift.currency);
    if (dto.cashRounding && cashRequired.isPositive()) {
      const policy = CashRoundingPolicy.fromConfig(dto.cashRounding);
      const roundedRes = policy.round(cashRequired);
      cashRequired = roundedRes.rounded;
      roundingAdjustment = roundedRes.adjustment;
    }

    // 3. Manejo de propinas si aplica
    let tipMoney: Money | undefined;
    let tipCashAdditional = Money.zero(shift.currency);

    if (dto.tip && dto.tip.amount > 0) {
      tipMoney = Money.fromDecimal(dto.tip.amount, shift.currency);
      if (dto.tip.paymentMethod === PaymentMethod.CASH) {
        tipCashAdditional = tipMoney;
      }
    }

    const totalCashNeeded = cashRequired.add(tipCashAdditional);

    // 4. Vuelto y denominaciones (solo cálculo: no se muta el turno hasta el commit atómico)
    let changeGiven = Money.zero(shift.currency);
    let tenderedMoney: Money | undefined;
    let foreignTenderedAmount: Money | undefined;
    let foreignExchangeRate: ExchangeRate | undefined;
    let optimalChangeBreakdown: CashBreakdown | undefined;
    let drawerAdded: CashBreakdown | undefined;
    let drawerDeducted: CashBreakdown | undefined;
    let drawerStockUpdated = false;

    const tenderedBreakdown = dto.tenderedBreakdownCounts && Object.keys(dto.tenderedBreakdownCounts).length > 0
      ? new CashBreakdown(dto.tenderedBreakdownCounts, shift.currency)
      : undefined;

    if (dto.foreignTendered) {
      foreignExchangeRate = dto.foreignTendered.exchangeRate;
      foreignTenderedAmount = Money.fromDecimal(dto.foreignTendered.amount, foreignExchangeRate.fromCurrency);
      tenderedMoney = foreignExchangeRate.convertToBase(foreignTenderedAmount);
    }

    if (tenderedMoney || dto.tenderedCash !== undefined || totalCashNeeded.isPositive() || tenderedBreakdown) {
      if (!tenderedMoney) {
        const tenderedVal = dto.tenderedCash !== undefined ? dto.tenderedCash : totalCashNeeded.toDecimal();
        tenderedMoney = Money.fromDecimal(tenderedVal, shift.currency);
      }

      if (tenderedMoney.lessThan(totalCashNeeded)) {
        throw new InvalidPaymentError(
          `Efectivo entregado insuficiente: el cliente entregó ${tenderedMoney.toString()}, pero el total en efectivo requerido es ${totalCashNeeded.toString()}.`
        );
      }

      if (tenderedBreakdown && !tenderedBreakdown.calculateTotal().equals(tenderedMoney)) {
        throw new InvalidPaymentError(
          `El desglose de billetes entregados (${tenderedBreakdown.calculateTotal().toString()}) no coincide con el efectivo recibido (${tenderedMoney.toString()}).`
        );
      }

      changeGiven = tenderedMoney.subtract(totalCashNeeded);

      if (changeGiven.isPositive()) {
        const availableCashInDrawer = shift.calculateExpectedCash();

        if (changeGiven.greaterThan(availableCashInDrawer)) {
          throw new InsufficientCashInDrawerError(
            changeGiven.toDecimal(),
            availableCashInDrawer.toDecimal(),
            shift.currency
          );
        }

        if (shift.drawerBreakdown.calculateTotal().isPositive() || dto.requireExactDenominations) {
          let virtualDrawer = shift.drawerBreakdown;
          if (tenderedBreakdown) {
            virtualDrawer = virtualDrawer.add(tenderedBreakdown);
          }

          const optimalResult = virtualDrawer.calculateOptimalChange(changeGiven);

          if (!optimalResult.possible && dto.requireExactDenominations) {
            throw new InsufficientChangeDenominationsError(
              changeGiven.toDecimal(),
              shift.currency,
              `No hay combinación física de billetes y monedas para entregar ${changeGiven.toString()}.`
            );
          }

          if (optimalResult.possible) {
            optimalChangeBreakdown = optimalResult.changeBreakdown;
            drawerAdded = tenderedBreakdown;
            drawerDeducted = optimalChangeBreakdown;
            drawerStockUpdated = true;
          }
        }
      } else if (tenderedBreakdown) {
        drawerAdded = tenderedBreakdown;
        drawerStockUpdated = true;
      }
    }

    // 5. Construir movimientos (aún sin aplicar)
    const toRecord: CashMovement[] = [];
    const defaultConcept = dto.concept || `Cobro de comprobante ${dto.transactionReference}`;

    const settlement: PaymentSettlement | undefined = tenderedMoney
      ? { tendered: tenderedMoney, change: changeGiven, changeBreakdown: optimalChangeBreakdown }
      : undefined;
    const settlementOnCashSale = cashRequired.isPositive();

    for (let i = 0; i < nonCashItems.length; i++) {
      const item = nonCashItems[i];
      const movIdempotency = dto.idempotencyKey ? `${dto.idempotencyKey}-nc-${i}` : undefined;

      toRecord.push(new CashMovement({
        id: item.input.id,
        shiftId: shift.id,
        type: MovementType.SALE,
        amount: item.amount,
        paymentMethod: item.input.method,
        concept: defaultConcept,
        referenceId: dto.transactionReference,
        performedBy: dto.performedBy,
        idempotencyKey: movIdempotency,
        exchangeRate: item.input.exchangeRate,
        foreignAmount: item.foreignMoney,
      }));
    }

    if (cashRequired.isPositive()) {
      const cashMovId = explicitCashInput?.id || `${dto.transactionReference}-cash`;
      const cashIdempotency = dto.idempotencyKey ? `${dto.idempotencyKey}-cash` : undefined;

      let cashForeign: Money | undefined;
      if (explicitCashInput?.exchangeRate && explicitCashInput?.foreignAmount !== undefined) {
        cashForeign = Money.fromDecimal(explicitCashInput.foreignAmount, explicitCashInput.exchangeRate.fromCurrency);
      }

      toRecord.push(new CashMovement({
        id: cashMovId,
        shiftId: shift.id,
        type: MovementType.SALE,
        amount: cashRequired,
        paymentMethod: PaymentMethod.CASH,
        concept: defaultConcept,
        referenceId: dto.transactionReference,
        performedBy: dto.performedBy,
        idempotencyKey: cashIdempotency,
        exchangeRate: explicitCashInput?.exchangeRate,
        foreignAmount: cashForeign,
        settlement: settlementOnCashSale ? settlement : undefined,
      }));
    }

    // Movimiento de propina independiente
    if (dto.tip && tipMoney && tipMoney.isPositive()) {
      const tipDetails: TipDetails = {
        serverEmployeeId: dto.tip.serverEmployeeId,
        serverName: dto.tip.serverName,
      };

      toRecord.push(new CashMovement({
        id: dto.tip.id,
        shiftId: shift.id,
        type: MovementType.TIP,
        amount: tipMoney,
        paymentMethod: dto.tip.paymentMethod,
        concept: `Propina (${dto.tip.serverName || 'General'}) comprobante ${dto.transactionReference}`,
        referenceId: dto.transactionReference,
        performedBy: dto.performedBy,
        tipDetails,
        idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}-tip` : undefined,
        settlement: !settlementOnCashSale ? settlement : undefined,
      }));
    }

    // 6. Commit atómico: movimientos + existencia física de billetes
    const recordedMovements = shift.recordTransaction(toRecord, { drawerAdded, drawerDeducted });
    const finalizedTipMovement = recordedMovements.find((m) => m.type === MovementType.TIP);

    await this.shiftRepo.save(shift);

    if (this.publishEvent) {
      const currentCash = shift.calculateExpectedCash();
      for (const mov of recordedMovements) {
        await this.publishEvent(new CashMovementRecordedEvent(shift.id, mov, currentCash));
      }

      if (shift.isCashLimitExceeded() && shift.maxCashThreshold) {
        const excess = currentCash.subtract(shift.maxCashThreshold);
        await this.publishEvent(
          new CashLimitExceededEvent(shift.id, currentCash, shift.maxCashThreshold, excess)
        );
      }
    }

    return {
      movements: recordedMovements,
      ticketTotal: ticketTotalMoney,
      totalPaid: nonCashCovered.add(cashRequired),
      cashRequired,
      changeGiven,
      tenderedCash: tenderedMoney,
      roundingAdjustment: !roundingAdjustment.isZero() ? roundingAdjustment : undefined,
      foreignTenderedAmount,
      foreignExchangeRate,
      tipMovement: finalizedTipMovement,
      optimalChangeBreakdown,
      isCashLimitExceeded: shift.isCashLimitExceeded(),
      drawerStockUpdated,
      isReplay: false,
    };
  }

  /**
   * Reconstruye el resultado original de una transacción ya registrada (reintento idempotente).
   */
  private rebuildResult(shift: CashShift, movements: CashMovement[]): PaymentResult {
    const ordered = [...movements].sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0));
    const sales = ordered.filter((m) => m.type === MovementType.SALE);
    const cashSale = sales.find((m) => m.paymentMethod === PaymentMethod.CASH);
    const tipMovement = ordered.find((m) => m.type === MovementType.TIP);
    const settlement = ordered.find((m) => m.settlement)?.settlement;

    const ticketTotal = sales.reduce((acc, m) => acc.add(m.amount), Money.zero(shift.currency));
    const cashRequired = cashSale ? cashSale.amount : Money.zero(shift.currency);

    return {
      movements: ordered,
      ticketTotal,
      totalPaid: ticketTotal,
      cashRequired,
      changeGiven: settlement ? settlement.change : Money.zero(shift.currency),
      tenderedCash: settlement?.tendered,
      tipMovement,
      optimalChangeBreakdown: settlement?.changeBreakdown,
      isCashLimitExceeded: shift.isCashLimitExceeded(),
      drawerStockUpdated: false,
      isReplay: true,
    };
  }
}

import { CurrencyMismatchError, InvalidCashierInputError } from '../domain/errors/cashier-errors.js';
import { ExpenseCategory } from '../domain/entities/cash-movement.js';
import { CashShift, ShiftStatus } from '../domain/entities/cash-shift.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { Money } from '../domain/value-objects/money.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';
import { ICashRegisterRepository } from '../repositories/cash-register-repository.interface.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';

export interface ConsolidatedSummaryQuery {
  branchId?: string;
  cashRegisterIds?: string[];
  from?: Date;
  to?: Date;
  includeOpenShifts?: boolean;
}

export interface RegisterConsolidatedItem {
  cashRegisterId: string;
  cashRegisterName?: string;
  shiftsCount: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  expectedCash: number;
  declaredCash: number;
  cashDifference: number;
}

export interface ConsolidatedFinancialSummary {
  currency: string;
  shiftsCount: number;
  openShiftsCount: number;
  closedShiftsCount: number;
  totalInitialBalance: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalSafeDrops: number;
  totalTipsCollected: number;
  totalTipsPaidOut: number;
  unpaidTipsBalance: number;
  totalVoidedAmount: number;
  totalExpectedCash: number;
  totalDeclaredCash: number;
  totalCashDifference: number;
  totalsByMethod: Record<PaymentMethod, { in: number; out: number; net: number }>;
  expensesByCategory: Record<ExpenseCategory, number>;
  byRegister: RegisterConsolidatedItem[];
}

export interface GetConsolidatedSummaryOptions {
  features?: CashierFeatureProfile;
}

/**
 * Caso de uso: Consolidar múltiples turnos o cajas (por sucursal, lista de cajas o rango de fechas).
 */
export class GetConsolidatedSummaryUseCase {
  private readonly features: CashierFeatureFlags;

  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly registerRepo?: ICashRegisterRepository,
    options: GetConsolidatedSummaryOptions = {}
  ) {
    this.features = resolveCashierFeatures(options.features);
  }

  public async execute(query: ConsolidatedSummaryQuery = {}): Promise<ConsolidatedFinancialSummary> {
    assertFeatureEnabled(this.features, 'consolidatedReports');

    let targetRegisterIds = query.cashRegisterIds ? [...query.cashRegisterIds] : undefined;
    const registerNames = new Map<string, string>();

    if (this.registerRepo) {
      const allRegs = await this.registerRepo.findAll();
      for (const r of allRegs) {
        registerNames.set(r.id, r.name);
      }
      if (query.branchId) {
        const branchRegIds = allRegs.filter((r) => r.branchId === query.branchId).map((r) => r.id);
        targetRegisterIds = targetRegisterIds
          ? targetRegisterIds.filter((id) => branchRegIds.includes(id))
          : branchRegIds;
      }
    }

    const statuses = query.includeOpenShifts === false
      ? [ShiftStatus.CLOSED]
      : [ShiftStatus.OPEN, ShiftStatus.SUSPENDED, ShiftStatus.LOCKED, ShiftStatus.CLOSED];

    let shifts: CashShift[] = [];
    if (this.shiftRepo.findByFilter) {
      shifts = await this.shiftRepo.findByFilter({
        cashRegisterIds: targetRegisterIds,
        from: query.from,
        to: query.to,
        statuses,
      });
    } else if (targetRegisterIds) {
      for (const regId of targetRegisterIds) {
        const regShifts = await this.shiftRepo.findByCashRegisterId(regId, 500);
        shifts.push(
          ...regShifts.filter((s) => {
            if (!statuses.includes(s.status)) return false;
            if (query.from && s.openedAt < query.from) return false;
            if (query.to && s.openedAt > query.to) return false;
            return true;
          })
        );
      }
    } else {
      throw new InvalidCashierInputError(
        'El repositorio de turnos no implementa findByFilter; especifique cashRegisterIds para consolidar.'
      );
    }

    const currency = shifts[0]?.currency ?? 'USD';
    let totalInitialBalance = Money.zero(currency);
    let grossSales = Money.zero(currency);
    let refunds = Money.zero(currency);
    let totalDeposits = Money.zero(currency);
    let totalWithdrawals = Money.zero(currency);
    let totalSafeDrops = Money.zero(currency);
    let totalTipsCollected = Money.zero(currency);
    let totalTipsPaidOut = Money.zero(currency);
    let totalVoidedAmount = Money.zero(currency);
    let totalExpectedCash = Money.zero(currency);
    let totalDeclaredCash = Money.zero(currency);
    let totalCashDifference = Money.zero(currency);

    const totalsByMethod = {} as Record<PaymentMethod, { in: Money; out: Money; net: Money }>;
    for (const m of Object.values(PaymentMethod)) {
      totalsByMethod[m] = {
        in: Money.zero(currency),
        out: Money.zero(currency),
        net: Money.zero(currency),
      };
    }

    const expensesByCategory = {} as Record<ExpenseCategory, Money>;
    for (const c of Object.values(ExpenseCategory)) {
      expensesByCategory[c] = Money.zero(currency);
    }

    const byRegMap = new Map<string, {
      shiftsCount: number;
      grossSales: Money;
      refunds: Money;
      expectedCash: Money;
      declaredCash: Money;
      cashDifference: Money;
    }>();

    let openShiftsCount = 0;
    let closedShiftsCount = 0;

    for (const shift of shifts) {
      if (shift.currency !== currency) {
        throw new CurrencyMismatchError(currency, shift.currency);
      }

      if (shift.isClosed()) closedShiftsCount++;
      else openShiftsCount++;

      const summary = shift.calculateSummary();
      totalInitialBalance = totalInitialBalance.add(summary.initialBalance);
      grossSales = grossSales.add(summary.totalSales);
      refunds = refunds.add(summary.totalRefunds);
      totalDeposits = totalDeposits.add(summary.totalDeposits);
      totalWithdrawals = totalWithdrawals.add(summary.totalWithdrawals);
      totalSafeDrops = totalSafeDrops.add(summary.totalSafeDrops);
      totalTipsCollected = totalTipsCollected.add(summary.totalTipsCollected);
      totalTipsPaidOut = totalTipsPaidOut.add(summary.totalTipsPaidOut);
      totalVoidedAmount = totalVoidedAmount.add(summary.totalVoidedAmount);
      totalExpectedCash = totalExpectedCash.add(summary.currentCashInDrawer);

      const declared = shift.reconciliation ? shift.reconciliation.declaredCash : Money.zero(currency);
      const diff = shift.reconciliation ? shift.reconciliation.cashDifference : Money.zero(currency);
      totalDeclaredCash = totalDeclaredCash.add(declared);
      totalCashDifference = totalCashDifference.add(diff);

      for (const m of Object.values(PaymentMethod)) {
        totalsByMethod[m].in = totalsByMethod[m].in.add(summary.totalsByMethod[m].in);
        totalsByMethod[m].out = totalsByMethod[m].out.add(summary.totalsByMethod[m].out);
        totalsByMethod[m].net = totalsByMethod[m].net.add(summary.totalsByMethod[m].net);
      }

      for (const c of Object.values(ExpenseCategory)) {
        expensesByCategory[c] = expensesByCategory[c].add(summary.expensesByCategory[c]);
      }

      let regEntry = byRegMap.get(shift.cashRegisterId);
      if (!regEntry) {
        regEntry = {
          shiftsCount: 0,
          grossSales: Money.zero(currency),
          refunds: Money.zero(currency),
          expectedCash: Money.zero(currency),
          declaredCash: Money.zero(currency),
          cashDifference: Money.zero(currency),
        };
        byRegMap.set(shift.cashRegisterId, regEntry);
      }
      regEntry.shiftsCount += 1;
      regEntry.grossSales = regEntry.grossSales.add(summary.totalSales);
      regEntry.refunds = regEntry.refunds.add(summary.totalRefunds);
      regEntry.expectedCash = regEntry.expectedCash.add(summary.currentCashInDrawer);
      regEntry.declaredCash = regEntry.declaredCash.add(declared);
      regEntry.cashDifference = regEntry.cashDifference.add(diff);
    }

    const totalsByMethodNum = {} as Record<PaymentMethod, { in: number; out: number; net: number }>;
    for (const m of Object.values(PaymentMethod)) {
      totalsByMethodNum[m] = {
        in: totalsByMethod[m].in.toDecimal(),
        out: totalsByMethod[m].out.toDecimal(),
        net: totalsByMethod[m].net.toDecimal(),
      };
    }

    const expensesByCatNum = {} as Record<ExpenseCategory, number>;
    for (const c of Object.values(ExpenseCategory)) {
      expensesByCatNum[c] = expensesByCategory[c].toDecimal();
    }

    return {
      currency,
      shiftsCount: shifts.length,
      openShiftsCount,
      closedShiftsCount,
      totalInitialBalance: totalInitialBalance.toDecimal(),
      grossSales: grossSales.toDecimal(),
      refunds: refunds.toDecimal(),
      netSales: grossSales.subtract(refunds).toDecimal(),
      totalDeposits: totalDeposits.toDecimal(),
      totalWithdrawals: totalWithdrawals.toDecimal(),
      totalSafeDrops: totalSafeDrops.toDecimal(),
      totalTipsCollected: totalTipsCollected.toDecimal(),
      totalTipsPaidOut: totalTipsPaidOut.toDecimal(),
      unpaidTipsBalance: totalTipsCollected.subtract(totalTipsPaidOut).toDecimal(),
      totalVoidedAmount: totalVoidedAmount.toDecimal(),
      totalExpectedCash: totalExpectedCash.toDecimal(),
      totalDeclaredCash: totalDeclaredCash.toDecimal(),
      totalCashDifference: totalCashDifference.toDecimal(),
      totalsByMethod: totalsByMethodNum,
      expensesByCategory: expensesByCatNum,
      byRegister: Array.from(byRegMap.entries()).map(([cashRegisterId, v]) => ({
        cashRegisterId,
        cashRegisterName: registerNames.get(cashRegisterId),
        shiftsCount: v.shiftsCount,
        grossSales: v.grossSales.toDecimal(),
        refunds: v.refunds.toDecimal(),
        netSales: v.grossSales.subtract(v.refunds).toDecimal(),
        expectedCash: v.expectedCash.toDecimal(),
        declaredCash: v.declaredCash.toDecimal(),
        cashDifference: v.cashDifference.toDecimal(),
      })),
    };
  }
}

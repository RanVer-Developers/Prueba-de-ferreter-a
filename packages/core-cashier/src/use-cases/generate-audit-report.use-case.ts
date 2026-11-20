import { ReportNotAvailableError, ShiftNotFoundError } from '../domain/errors/cashier-errors.js';
import { ShiftReportData } from '../domain/entities/audit-report.js';
import { ICashRegisterRepository } from '../repositories/cash-register-repository.interface.js';
import { ICashShiftRepository } from '../repositories/cash-shift-repository.interface.js';

/**
 * Caso de uso: Generar Reportes de Auditoría X (parcial) y Z (cierre final).
 */
export class GenerateAuditReportUseCase {
  constructor(
    private readonly shiftRepo: ICashShiftRepository,
    private readonly registerRepo?: ICashRegisterRepository
  ) {}

  public async execute(shiftId: string, type: 'X' | 'Z'): Promise<ShiftReportData> {
    const shift = await this.shiftRepo.findById(shiftId);
    if (!shift) {
      throw new ShiftNotFoundError(shiftId);
    }

    if (type === 'Z') {
      // El Z solo existe para turnos cerrados y, una vez emitido, queda congelado (se reimprime idéntico)
      if (!shift.isClosed()) {
        throw new ReportNotAvailableError(shiftId, 'el reporte Z solo puede emitirse con el turno cerrado.');
      }
      if (shift.zReport) {
        return shift.zReport;
      }
    }

    let registerName: string | undefined;
    if (this.registerRepo) {
      const reg = await this.registerRepo.findById(shift.cashRegisterId);
      registerName = reg?.name;
    }

    const summary = shift.calculateSummary();

    const totalsByMethod = Object.entries(summary.totalsByMethod).map(([method, val]) => ({
      method: method as any,
      in: val.in.toDecimal(),
      out: val.out.toDecimal(),
      net: val.net.toDecimal(),
    }));

    const expensesByCategory: Record<string, number> = {};
    for (const [cat, money] of Object.entries(summary.expensesByCategory)) {
      expensesByCategory[cat] = money.toDecimal();
    }

    const report: ShiftReportData = {
      reportType: type,
      reportTitle: type === 'Z' ? 'CORTE FISCAL Z (CIERRE FINAL)' : 'LECTURA PARCIAL X (AUDITORÍA)',
      reportNumber: undefined,
      generatedAt: new Date().toISOString(),
      isFiscalFinalCut: type === 'Z',
      shiftId: shift.id,
      cashRegisterId: shift.cashRegisterId,
      cashRegisterName: registerName,
      cashierId: shift.cashier.id,
      cashierName: shift.cashier.name,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString(),
      currency: shift.currency,
      initialBalance: shift.initialBalance.toDecimal(),
      grossSales: summary.totalSales.toDecimal(),
      refunds: summary.totalRefunds.toDecimal(),
      netSales: summary.totalSales.subtract(summary.totalRefunds).toDecimal(),
      tipsCollected: summary.totalTipsCollected.toDecimal(),
      tipsPaidOut: summary.totalTipsPaidOut.toDecimal(),
      unpaidTips: summary.unpaidTipsBalance.toDecimal(),
      deposits: summary.totalDeposits.toDecimal(),
      withdrawals: summary.totalWithdrawals.toDecimal(),
      safeDrops: summary.totalSafeDrops.toDecimal(),
      voidedTotal: summary.totalVoidedAmount.toDecimal(),
      currentCashInDrawer: summary.currentCashInDrawer.toDecimal(),
      reconciliation: shift.reconciliation ? {
        expectedCash: shift.reconciliation.expectedCash.toDecimal(),
        declaredCash: shift.reconciliation.declaredCash.toDecimal(),
        difference: shift.reconciliation.cashDifference.toDecimal(),
        status: shift.reconciliation.cashStatus,
        retainedFloat: shift.reconciliation.retainedFloatAmount?.toDecimal(),
        bankDeposit: shift.reconciliation.bankDepositAmount?.toDecimal(),
        supervisorId: shift.reconciliation.supervisorId,
        signatureToken: shift.reconciliation.signatureToken,
        isBlindCount: shift.reconciliation.isBlindCount,
        cashBreakdown: shift.reconciliation.cashBreakdown?.toJSON(),
        posVoucherBatches: shift.reconciliation.posVoucherBatches.map((b) => ({
          terminalId: b.terminalId,
          batchNumber: b.batchNumber,
          paymentMethod: b.paymentMethod,
          voucherCount: b.voucherCount,
          totalAmount: b.totalAmount.toDecimal(),
        })),
      } : undefined,
      totalsByMethod,
      expensesByCategory,
      movementsCount: shift.movements.length,
      drawerOpeningsCount: shift.drawerOpenHistory.length,
    };

    if (type === 'Z') {
      if (this.registerRepo) {
        const register = await this.registerRepo.findById(shift.cashRegisterId);
        if (register) {
          report.reportNumber = register.allocateZReportNumber();
          await this.registerRepo.save(register);
        }
      }
      shift.sealZReport(report);
      await this.shiftRepo.save(shift);
      return shift.zReport!;
    }

    report.reportNumber = shift.nextXReportNumber();
    await this.shiftRepo.save(shift);
    return report;
  }
}

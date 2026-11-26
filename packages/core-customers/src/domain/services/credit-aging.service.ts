import { CreditLedgerEntry } from '../../schemas/customer.schemas.js';

export interface CreditAgingSummary {
  readonly totalOutstandingCents: number;
  readonly currentCents: number;
  readonly overdue1To30Cents: number;
  readonly overdue31To60Cents: number;
  readonly overdue61To90Cents: number;
  readonly overdueOver90Cents: number;
  readonly totalOverdueCents: number;
  readonly overdueChargesCount: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Pure calculation of Accounts Receivable aging buckets for a customer's unpaid credit charges.
 */
export function calculateCreditAging(
  creditLedger: ReadonlyArray<CreditLedgerEntry>,
  asOf: Date = new Date()
): CreditAgingSummary {
  let currentCents = 0;
  let overdue1To30Cents = 0;
  let overdue31To60Cents = 0;
  let overdue61To90Cents = 0;
  let overdueOver90Cents = 0;
  let overdueChargesCount = 0;

  const asOfMs = asOf.getTime();

  for (const entry of creditLedger) {
    if (entry.type !== 'CHARGE' && entry.type !== 'ADJUSTMENT_DEBIT') {
      continue;
    }
    const unpaid = entry.amountCents - entry.settledCents;
    if (unpaid <= 0) {
      continue;
    }

    if (!entry.dueAt) {
      currentCents += unpaid;
      continue;
    }

    const dueMs = new Date(entry.dueAt).getTime();
    if (asOfMs <= dueMs) {
      currentCents += unpaid;
      continue;
    }

    const daysPastDue = Math.floor((asOfMs - dueMs) / MS_PER_DAY);
    if (daysPastDue <= 0) {
      currentCents += unpaid;
      continue;
    }

    overdueChargesCount += 1;
    if (daysPastDue <= 30) {
      overdue1To30Cents += unpaid;
    } else if (daysPastDue <= 60) {
      overdue31To60Cents += unpaid;
    } else if (daysPastDue <= 90) {
      overdue61To90Cents += unpaid;
    } else {
      overdueOver90Cents += unpaid;
    }
  }

  const totalOverdueCents =
    overdue1To30Cents + overdue31To60Cents + overdue61To90Cents + overdueOver90Cents;

  return {
    totalOutstandingCents: currentCents + totalOverdueCents,
    currentCents,
    overdue1To30Cents,
    overdue31To60Cents,
    overdue61To90Cents,
    overdueOver90Cents,
    totalOverdueCents,
    overdueChargesCount,
  };
}

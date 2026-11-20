import { InvalidMoneyAmountError, InvalidSignatureError } from '../domain/errors/cashier-errors.js';
import { buildReconciliationSignaturePayload, ISignatureVerifier } from '../domain/services/signature-verifier.js';
import { CashBreakdown } from '../domain/value-objects/cash-denomination.js';
import { Money } from '../domain/value-objects/money.js';
import { PaymentMethod } from '../domain/value-objects/payment-method.js';

export interface DeclaredAmountsInput {
  declaredCashAmount?: number;
  cashBreakdownCounts?: Record<number, number>;
  declaredByMethod?: Partial<Record<PaymentMethod, number>>;
}

export function buildDeclaredAmounts(
  currency: string,
  input: DeclaredAmountsInput
): { cashBreakdown?: CashBreakdown; declaredMap: Map<PaymentMethod, Money> } {
  let cashBreakdown: CashBreakdown | undefined;
  if (input.cashBreakdownCounts && Object.keys(input.cashBreakdownCounts).length > 0) {
    cashBreakdown = new CashBreakdown(input.cashBreakdownCounts, currency);
  }

  const declaredMap = new Map<PaymentMethod, Money>();
  if (input.declaredByMethod) {
    for (const [method, amount] of Object.entries(input.declaredByMethod)) {
      if (amount !== undefined) {
        declaredMap.set(method as PaymentMethod, Money.fromDecimal(amount, currency));
      }
    }
  }

  if (input.declaredCashAmount !== undefined) {
    const declaredCash = Money.fromDecimal(input.declaredCashAmount, currency);
    if (cashBreakdown && !cashBreakdown.calculateTotal().equals(declaredCash)) {
      throw new InvalidMoneyAmountError(
        input.declaredCashAmount,
        `El efectivo declarado (${declaredCash.toString()}) no coincide con el desglose físico (${cashBreakdown.calculateTotal().toString()}).`
      );
    }
    declaredMap.set(PaymentMethod.CASH, declaredCash);
  } else if (cashBreakdown) {
    declaredMap.set(PaymentMethod.CASH, cashBreakdown.calculateTotal());
  }

  return { cashBreakdown, declaredMap };
}

export async function verifySupervisorSignature(
  shiftId: string,
  supervisorId: string | undefined,
  signatureToken: string | undefined,
  declaredCash: Money,
  verifier?: ISignatureVerifier
): Promise<void> {
  if (!supervisorId || !verifier) return;
  const payload = buildReconciliationSignaturePayload(shiftId, supervisorId, declaredCash);
  const valid = !!signatureToken && (await verifier.verify({
    shiftId,
    supervisorId,
    payload,
    token: signatureToken,
  }));
  if (!valid) {
    throw new InvalidSignatureError(supervisorId);
  }
}

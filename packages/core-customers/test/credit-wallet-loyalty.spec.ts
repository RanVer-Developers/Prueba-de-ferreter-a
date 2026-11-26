import { describe, expect, it } from 'vitest';
import {
  CreateCustomerUseCase,
  CreditAccountFrozenError,
  CreditLimitExceededError,
  InMemoryCustomerRepository,
  InsufficientCreditBalanceError,
  InsufficientLoyaltyPointsError,
  InsufficientWalletBalanceError,
  ManageCustomerCreditUseCase,
  ManageCustomerLoyaltyUseCase,
  ManageCustomerWalletUseCase,
} from '../src/index.js';

class ManualClock {
  private ms: number;
  constructor(iso = '2026-11-01T10:00:00.000Z') {
    this.ms = new Date(iso).getTime();
  }
  now(): Date {
    return new Date(this.ms);
  }
  advanceDays(days: number): void {
    this.ms += days * 86_400_000;
  }
}

describe('@modulos/core-customers: Credit Ledger, Aging, Wallet & Loyalty', () => {
  it('manages credit charges, FIFO aging buckets, overdue holds, and idempotent payments', async () => {
    const repo = new InMemoryCustomerRepository({ isolate: true });
    const clock = new ManualClock();
    const create = new CreateCustomerUseCase({ customerRepo: repo, clock });
    const credit = new ManageCustomerCreditUseCase({ customerRepo: repo, clock });

    await create.execute({
      id: 'c-cred',
      displayName: 'Distribuidora Norte',
      creditLimitCents: 100_000,
      creditTermDays: 15,
    });

    const charge1 = await credit.charge({
      customerId: 'c-cred',
      amountCents: 40_000,
      referenceId: 'INV-1',
      idempotencyKey: 'chg-1',
    });
    expect(charge1.isReplay).toBe(false);
    expect(charge1.customer.creditBalanceCents).toBe(40_000);
    expect(charge1.customer.availableCreditCents).toBe(60_000);

    // Offline idempotent replay
    const replay = await credit.charge({
      customerId: 'c-cred',
      amountCents: 40_000,
      referenceId: 'INV-1',
      idempotencyKey: 'chg-1',
    });
    expect(replay.isReplay).toBe(true);
    expect(replay.customer.creditBalanceCents).toBe(40_000);

    // Exceeding credit limit fails
    await expect(
      credit.charge({ customerId: 'c-cred', amountCents: 60_001 })
    ).rejects.toThrow(CreditLimitExceededError);

    // Advance 35 days -> INV-1 (term 15 days) is now 20 days overdue (1-30 bucket)
    clock.advanceDays(35);
    const aging = await credit.getAgingSummary('c-cred');
    expect(aging.overdue1To30Cents).toBe(40_000);
    expect(aging.totalOverdueCents).toBe(40_000);

    // enforceOverdueHold blocks new credit charge
    await expect(
      credit.charge({
        customerId: 'c-cred',
        amountCents: 10_000,
        enforceOverdueHold: true,
      })
    ).rejects.toThrow(CreditAccountFrozenError);

    // Cannot overpay
    await expect(
      credit.recordPayment({ customerId: 'c-cred', amountCents: 50_000 })
    ).rejects.toThrow(InsufficientCreditBalanceError);

    // Partial payment settles oldest charge partially
    await credit.recordPayment({
      customerId: 'c-cred',
      amountCents: 25_000,
      referenceId: 'ABONO-1',
    });
    const agingAfter = await credit.getAgingSummary('c-cred');
    expect(agingAfter.totalOutstandingCents).toBe(15_000);
    expect(agingAfter.overdue1To30Cents).toBe(15_000);

    // Manual freeze & unfreeze
    await credit.setFrozen('c-cred', true, 'Revisión de cobranza');
    await expect(credit.charge({ customerId: 'c-cred', amountCents: 1000 })).rejects.toThrow(
      CreditAccountFrozenError
    );
    await credit.setFrozen('c-cred', false);
    const afterUnfreeze = await credit.charge({ customerId: 'c-cred', amountCents: 1000 });
    expect(afterUnfreeze.customer.creditBalanceCents).toBe(16_000);
  });

  it('handles prepaid wallet deposits, spends, and insufficient balance guards', async () => {
    const repo = new InMemoryCustomerRepository({ isolate: true });
    const clock = new ManualClock();
    const create = new CreateCustomerUseCase({ customerRepo: repo, clock });
    const wallet = new ManageCustomerWalletUseCase({ customerRepo: repo, clock });

    await create.execute({ id: 'c-wal', displayName: 'Sofía' });

    const dep = await wallet.deposit({
      customerId: 'c-wal',
      amountCents: 25_000,
      idempotencyKey: 'w-1',
    });
    expect(dep.customer.walletBalanceCents).toBe(25_000);
    expect((await wallet.deposit({ customerId: 'c-wal', amountCents: 25_000, idempotencyKey: 'w-1' })).isReplay).toBe(
      true
    );

    await expect(wallet.spend({ customerId: 'c-wal', amountCents: 30_000 })).rejects.toThrow(
      InsufficientWalletBalanceError
    );

    const spent = await wallet.spend({ customerId: 'c-wal', amountCents: 10_000, referenceId: 'ORD-9' });
    expect(spent.customer.walletBalanceCents).toBe(15_000);
  });

  it('calculates loyalty earn with tier multipliers, redemptions, and FIFO expiration', async () => {
    const repo = new InMemoryCustomerRepository({ isolate: true });
    const clock = new ManualClock();
    const create = new CreateCustomerUseCase({ customerRepo: repo, clock });
    const loyalty = new ManageCustomerLoyaltyUseCase({
      customerRepo: repo,
      clock,
      policy: {
        centsPerPointEarned: 100, // 1 pt per $1.00
        centsPerPointRedeemed: 50, // 1 pt = $0.50
        minRedeemPoints: 10,
        maxRedeemPercentOfPurchase: 50,
        pointsExpirationDays: 90,
        tiers: [
          { code: 'STANDARD', name: 'Standard', minLifetimePoints: 0, earnMultiplier: 1.0 },
          { code: 'SILVER', name: 'Silver', minLifetimePoints: 500, earnMultiplier: 1.5 },
        ],
      },
      featureProfile: 'ADVANCED',
    });

    await create.execute({ id: 'c-loy', displayName: 'Luis' });

    // Spend 60_000 cents ($600) at 1.0x -> 600 points -> promotes to SILVER (>= 500 lifetime)
    const earn1 = await loyalty.earnFromPurchase({
      customerId: 'c-loy',
      spentCents: 60_000,
      referenceId: 'O1',
    });
    expect(earn1.pointsEarned).toBe(600);
    expect(earn1.tierCode).toBe('SILVER');

    // Next spend 20_000 cents ($200) at 1.5x -> 300 points
    const earn2 = await loyalty.earnFromPurchase({
      customerId: 'c-loy',
      spentCents: 20_000,
      referenceId: 'O2',
    });
    expect(earn2.pointsEarned).toBe(300);
    expect(earn2.customer.loyaltyPointsBalance).toBe(900);

    // Redeem 100 points ($50.00) on a $100.00 (10_000 cents) purchase -> 50% cap exact
    const redeemed = await loyalty.redeem({
      customerId: 'c-loy',
      pointsToRedeem: 100,
      purchaseAmountCents: 10_000,
      referenceId: 'O3',
    });
    expect(redeemed.discountCents).toBe(5_000);
    expect(redeemed.customer.loyaltyPointsBalance).toBe(800);

    await expect(
      loyalty.redeem({ customerId: 'c-loy', pointsToRedeem: 900 })
    ).rejects.toThrow(InsufficientLoyaltyPointsError);

    // Advance 91 days -> remaining 800 points expire
    clock.advanceDays(91);
    const expired = await loyalty.expirePoints('c-loy');
    expect(expired.expiredPoints).toBe(800);
    expect(expired.customer.loyaltyPointsBalance).toBe(0);
  });
});

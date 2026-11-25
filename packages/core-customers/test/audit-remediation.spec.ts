import { describe, expect, it } from 'vitest';
import {
  AnonymizeCustomerUseCase,
  ConcurrencyError,
  CreateCustomerUseCase,
  CurrencyMismatchError,
  Customer,
  CustomerBlockedError,
  InMemoryCustomerRepository,
  InsufficientLoyaltyPointsError,
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

describe('@modulos/core-customers Audit Remediation Tests', () => {
  it('defaults InMemoryCustomerRepository to isolate: true and enforces optimistic concurrency', async () => {
    const repo = new InMemoryCustomerRepository();
    await new CreateCustomerUseCase({ customerRepo: repo }).execute({
      id: 'c-iso',
      displayName: 'Cliente Iso',
    });

    const a = (await repo.findById('c-iso'))!;
    const b = (await repo.findById('c-iso'))!;
    a.updateProfile({ displayName: 'A' });
    await repo.save(a);

    b.updateProfile({ displayName: 'B' });
    await expect(repo.save(b)).rejects.toThrow(ConcurrencyError);
  });

  it('enforces CurrencyMismatchError on credit and wallet operations', async () => {
    const repo = new InMemoryCustomerRepository();
    await new CreateCustomerUseCase({ customerRepo: repo }).execute({
      id: 'c-cur',
      displayName: 'Multi',
      currency: 'MXN',
      creditLimitCents: 10_000,
    });

    const credit = new ManageCustomerCreditUseCase({ customerRepo: repo });
    await expect(
      credit.charge({ customerId: 'c-cur', amountCents: 500, currency: 'USD' })
    ).rejects.toThrow(CurrencyMismatchError);

    const wallet = new ManageCustomerWalletUseCase({ customerRepo: repo });
    await expect(
      wallet.deposit({ customerId: 'c-cur', amountCents: 500, currency: 'EUR' })
    ).rejects.toThrow(CurrencyMismatchError);
  });

  it('never consumes expired loyalty lots on redeem and scopes idempotency keys per domain', async () => {
    const repo = new InMemoryCustomerRepository();
    const clock = new ManualClock();
    await new CreateCustomerUseCase({ customerRepo: repo, clock }).execute({
      id: 'c-loy-exp',
      displayName: 'Luis',
      creditLimitCents: 50_000,
    });

    const loyalty = new ManageCustomerLoyaltyUseCase({
      customerRepo: repo,
      clock,
      policy: {
        centsPerPointEarned: 100,
        centsPerPointRedeemed: 50,
        minRedeemPoints: 10,
        pointsExpirationDays: 30,
      },
    });
    await loyalty.earnFromPurchase({ customerId: 'c-loy-exp', spentCents: 5_000 });

    clock.advanceDays(31);
    await expect(
      loyalty.redeem({ customerId: 'c-loy-exp', pointsToRedeem: 20 })
    ).rejects.toThrow(InsufficientLoyaltyPointsError);

    const credit = new ManageCustomerCreditUseCase({ customerRepo: repo, clock });
    const wallet = new ManageCustomerWalletUseCase({ customerRepo: repo, clock });
    await credit.charge({ customerId: 'c-loy-exp', amountCents: 1000, idempotencyKey: 'shared-k' });
    const dep = await wallet.deposit({
      customerId: 'c-loy-exp',
      amountCents: 2000,
      idempotencyKey: 'shared-k',
    });
    expect(dep.isReplay).toBe(false);
    expect(dep.customer.walletBalanceCents).toBe(2000);
  });

  it('scrubs code/segments/tags on anonymization and blocks credit freeze modifications', async () => {
    const repo = new InMemoryCustomerRepository();
    await new CreateCustomerUseCase({ customerRepo: repo, featureProfile: 'ADVANCED' }).execute({
      id: 'c-anon-full',
      code: 'RFC-SECRET',
      displayName: 'María',
      segments: ['VIP'],
      tags: ['local'],
    });

    await new AnonymizeCustomerUseCase({ customerRepo: repo }).execute('c-anon-full');
    const saved = (await repo.findById('c-anon-full'))!;
    expect(saved.code).toBeUndefined();
    expect(saved.segments).toEqual([]);
    expect(saved.tags).toEqual([]);

    expect(() => Customer.fromSnapshot(saved.toSnapshot()).freezeCredit('Hold')).toThrow(
      CustomerBlockedError
    );
  });
});

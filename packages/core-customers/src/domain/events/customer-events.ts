export type CustomerDomainEvent =
  | {
      readonly type: 'CustomerCreated';
      readonly customerId: string;
      readonly displayName: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerUpdated';
      readonly customerId: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerCreditCharged';
      readonly customerId: string;
      readonly amountCents: number;
      readonly balanceAfterCents: number;
      readonly referenceId?: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerCreditPaymentRecorded';
      readonly customerId: string;
      readonly amountCents: number;
      readonly balanceAfterCents: number;
      readonly referenceId?: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerCreditFrozen';
      readonly customerId: string;
      readonly frozen: boolean;
      readonly reason?: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerWalletDeposited';
      readonly customerId: string;
      readonly amountCents: number;
      readonly balanceAfterCents: number;
      readonly referenceId?: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerWalletSpent';
      readonly customerId: string;
      readonly amountCents: number;
      readonly balanceAfterCents: number;
      readonly referenceId?: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerLoyaltyEarned';
      readonly customerId: string;
      readonly points: number;
      readonly balanceAfter: number;
      readonly tierCode: string;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerLoyaltyRedeemed';
      readonly customerId: string;
      readonly points: number;
      readonly valueCents: number;
      readonly balanceAfter: number;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerLoyaltyExpired';
      readonly customerId: string;
      readonly expiredPoints: number;
      readonly balanceAfter: number;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'CustomerAnonymized';
      readonly customerId: string;
      readonly occurredAt: string;
    };

import { CashMovement, SafeDropDetails, UserSummary } from '../entities/cash-movement.js';
import { CashReconciliation } from '../entities/cash-reconciliation.js';
import { CashShift } from '../entities/cash-shift.js';
import { Money } from '../value-objects/money.js';

export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}

export class ShiftOpenedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.Opened';
  public readonly occurredAt: Date;

  constructor(
    public readonly shift: CashShift,
    public readonly initialBalance: Money
  ) {
    this.occurredAt = new Date();
  }
}

export class CashMovementRecordedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.MovementRecorded';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly movement: CashMovement,
    public readonly currentCashBalance: Money
  ) {
    this.occurredAt = new Date();
  }
}

export class SafeDropPerformedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.SafeDropPerformed';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly amount: Money,
    public readonly remainingCash: Money,
    public readonly reason: string,
    public readonly safeDropDetails?: SafeDropDetails,
    public readonly movementId?: string
  ) {
    this.occurredAt = new Date();
  }
}

export class CashLimitExceededEvent implements DomainEvent {
  public readonly eventName = 'CashShift.CashLimitExceeded';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly currentCashBalance: Money,
    public readonly maxCashThreshold: Money,
    public readonly recommendedSafeDropAmount: Money
  ) {
    this.occurredAt = new Date();
  }
}

export class ShiftSuspendedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.Suspended';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly reason: string,
    public readonly authorizedBy?: UserSummary
  ) {
    this.occurredAt = new Date();
  }
}

export class ShiftResumedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.Resumed';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly authorizedBy?: UserSummary
  ) {
    this.occurredAt = new Date();
  }
}

export class ShiftLockedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.Locked';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly reason: string
  ) {
    this.occurredAt = new Date();
  }
}

export class ShiftUnlockedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.Unlocked';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly authorizedBy?: UserSummary
  ) {
    this.occurredAt = new Date();
  }
}

export class ShiftHandoverEvent implements DomainEvent {
  public readonly eventName = 'CashShift.HandoverPerformed';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly outgoingCashier: UserSummary,
    public readonly incomingCashier: UserSummary,
    public readonly intermediateReconciliation: CashReconciliation
  ) {
    this.occurredAt = new Date();
  }
}

export class PaymentVoidedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.PaymentVoided';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly voidMovement: CashMovement,
    public readonly originalMovement: CashMovement,
    public readonly authorizedBy: UserSummary,
    public readonly reason: string
  ) {
    this.occurredAt = new Date();
  }
}

export class CashAuditPerformedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.AuditPerformed';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly reconciliation: CashReconciliation
  ) {
    this.occurredAt = new Date();
  }
}

export class ShiftClosedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.Closed';
  public readonly occurredAt: Date;

  constructor(
    public readonly shift: CashShift,
    public readonly reconciliation: CashReconciliation
  ) {
    this.occurredAt = new Date();
  }
}

export class DrawerOpenedWithoutSaleEvent implements DomainEvent {
  public readonly eventName = 'CashShift.DrawerOpenedWithoutSale';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly performedBy: UserSummary,
    public readonly reason: string,
    public readonly authorizedBy?: UserSummary
  ) {
    this.occurredAt = new Date();
  }
}

export class DenominationsExchangedEvent implements DomainEvent {
  public readonly eventName = 'CashShift.DenominationsExchanged';
  public readonly occurredAt: Date;

  constructor(
    public readonly shiftId: string,
    public readonly amount: Money,
    public readonly performedBy: UserSummary,
    public readonly reason?: string,
    public readonly authorizedBy?: UserSummary
  ) {
    this.occurredAt = new Date();
  }
}

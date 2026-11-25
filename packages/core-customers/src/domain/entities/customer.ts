import {
  CUSTOMER_SCHEMA_VERSION,
  CreditLedgerEntry,
  CurrencyCodeSchema,
  CustomerAddress,
  CustomerAddressSchema,
  CustomerMetadata,
  CustomerMetadataSchema,
  CustomerSnapshot,
  CustomerSnapshotSchema,
  CustomerStatus,
  CustomerTaxProfile,
  CustomerTaxProfileSchema,
  CustomerType,
  EmailSchema,
  LoyaltyLedgerEntry,
  LoyaltyLot,
  WalletLedgerEntry,
  parseWithCustomerSchema,
} from '../../schemas/customer.schemas.js';
import {
  CreditAccountFrozenError,
  CreditLimitExceededError,
  CurrencyMismatchError,
  CustomerBalanceNotSettledError,
  CustomerBlockedError,
  InsufficientCreditBalanceError,
  InsufficientLoyaltyPointsError,
  InsufficientWalletBalanceError,
  InvalidCustomerInputError,
} from '../errors/customer-errors.js';
import { CreditAgingSummary, calculateCreditAging } from '../services/credit-aging.service.js';
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  isCustomerFeatureEnabled,
  resolveCustomerFeatures,
} from '../services/customer-features.js';
import {
  DEFAULT_LOYALTY_POLICY,
  LoyaltyPolicy,
  calculatePointsToEarn,
  calculateRedemptionValueCents,
  resolveLoyaltyTier,
} from '../services/loyalty-policy.service.js';

export interface CreateCustomerProps {
  id: string;
  code?: string;
  type?: CustomerType;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  currency?: string;
  taxProfile?: CustomerTaxProfile;
  addresses?: CustomerAddress[];
  segments?: string[];
  tags?: string[];
  marketingConsent?: boolean;
  notes?: string;
  metadata?: CustomerMetadata;
  creditLimitCents?: number;
  creditTermDays?: number;
  now?: Date;
  featureProfile?: CustomerFeatureProfile;
}

export interface CustomerPublicSummary {
  readonly id: string;
  readonly code?: string;
  readonly type: CustomerType;
  readonly status: CustomerStatus;
  readonly displayName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly currency: string;
  readonly creditLimitCents: number;
  readonly creditBalanceCents: number;
  readonly availableCreditCents: number;
  readonly creditFrozen: boolean;
  readonly walletBalanceCents: number;
  readonly loyaltyTierCode: string;
  readonly loyaltyPointsBalance: number;
  readonly version: number;
}

export class Customer {
  public readonly schemaVersion = CUSTOMER_SCHEMA_VERSION;
  public readonly id: string;
  private _code?: string;
  private _type: CustomerType;
  private _status: CustomerStatus;
  private _displayName: string;
  private _firstName?: string;
  private _lastName?: string;
  private _email?: string;
  private _phone?: string;
  public readonly currency: string;
  private _taxProfile?: CustomerTaxProfile;
  private _addresses: CustomerAddress[];
  private _segments: string[];
  private _tags: string[];
  private _marketingConsent: boolean;
  private _notes?: string;
  private _metadata?: CustomerMetadata;

  private _creditLimitCents: number;
  private _creditTermDays: number;
  private _creditBalanceCents: number;
  private _creditFrozen: boolean;
  private _creditFreezeReason?: string;
  private _creditLedger: CreditLedgerEntry[];

  private _walletBalanceCents: number;
  private _walletLedger: WalletLedgerEntry[];

  private _loyaltyTierCode: string;
  private _loyaltyPointsBalance: number;
  private _loyaltyLifetimePoints: number;
  private _loyaltyLots: LoyaltyLot[];
  private _loyaltyLedger: LoyaltyLedgerEntry[];

  private _processedOperationKeys: Set<string>;
  private _version: number;
  private _persistedVersion: number;
  public readonly createdAt: string;
  private _updatedAt: string;
  private _anonymizedAt?: string;

  private constructor(snap: CustomerSnapshot) {
    this.id = snap.id;
    this._code = snap.code;
    this._type = snap.type;
    this._status = snap.status;
    this._displayName = snap.displayName;
    this._firstName = snap.firstName;
    this._lastName = snap.lastName;
    this._email = snap.email;
    this._phone = snap.phone;
    this.currency = snap.currency;
    this._taxProfile = snap.taxProfile ? { ...snap.taxProfile } : undefined;
    this._addresses = snap.addresses.map((a) => ({ ...a }));
    this._segments = [...snap.segments];
    this._tags = [...snap.tags];
    this._marketingConsent = snap.marketingConsent;
    this._notes = snap.notes;
    this._metadata = snap.metadata ? { ...snap.metadata } : undefined;

    this._creditLimitCents = snap.creditLimitCents;
    this._creditTermDays = snap.creditTermDays;
    this._creditBalanceCents = snap.creditBalanceCents;
    this._creditFrozen = snap.creditFrozen;
    this._creditFreezeReason = snap.creditFreezeReason;
    this._creditLedger = snap.creditLedger.map((e) => ({ ...e }));

    this._walletBalanceCents = snap.walletBalanceCents;
    this._walletLedger = snap.walletLedger.map((e) => ({ ...e }));

    this._loyaltyTierCode = snap.loyaltyTierCode;
    this._loyaltyPointsBalance = snap.loyaltyPointsBalance;
    this._loyaltyLifetimePoints = snap.loyaltyLifetimePoints;
    this._loyaltyLots = snap.loyaltyLots.map((l) => ({ ...l }));
    this._loyaltyLedger = snap.loyaltyLedger.map((e) => ({ ...e }));

    this._processedOperationKeys = new Set(snap.processedOperationKeys);
    this._version = snap.version;
    this._persistedVersion = snap.version;
    this.createdAt = snap.createdAt;
    this._updatedAt = snap.updatedAt;
    this._anonymizedAt = snap.anonymizedAt;
  }

  public static create(props: CreateCustomerProps): Customer {
    const flags = resolveCustomerFeatures(props.featureProfile);
    const nowIso = (props.now ?? new Date()).toISOString();

    const parsed = parseWithCustomerSchema(
      CustomerSnapshotSchema,
      {
        schemaVersion: CUSTOMER_SCHEMA_VERSION,
        id: props.id,
        code: props.code,
        type: isCustomerFeatureEnabled(flags, 'customerTypes') ? (props.type ?? 'INDIVIDUAL') : 'INDIVIDUAL',
        status: 'ACTIVE',
        displayName: props.displayName,
        firstName: props.firstName,
        lastName: props.lastName,
        email: props.email,
        phone: props.phone,
        currency: props.currency ?? 'MXN',
        taxProfile: isCustomerFeatureEnabled(flags, 'customerTypes') ? props.taxProfile : undefined,
        addresses: isCustomerFeatureEnabled(flags, 'multipleAddresses')
          ? (props.addresses ?? [])
          : (props.addresses ?? []).slice(0, 1),
        segments: isCustomerFeatureEnabled(flags, 'segmentsAndTags') ? (props.segments ?? []) : [],
        tags: isCustomerFeatureEnabled(flags, 'segmentsAndTags') ? (props.tags ?? []) : [],
        marketingConsent: props.marketingConsent ?? false,
        notes: props.notes,
        metadata: props.metadata,
        creditLimitCents: isCustomerFeatureEnabled(flags, 'creditAccounts')
          ? (props.creditLimitCents ?? 0)
          : 0,
        creditTermDays: isCustomerFeatureEnabled(flags, 'creditAccounts')
          ? (props.creditTermDays ?? 0)
          : 0,
        creditBalanceCents: 0,
        creditFrozen: false,
        creditLedger: [],
        walletBalanceCents: 0,
        walletLedger: [],
        loyaltyTierCode: 'STANDARD',
        loyaltyPointsBalance: 0,
        loyaltyLifetimePoints: 0,
        loyaltyLots: [],
        loyaltyLedger: [],
        processedOperationKeys: [],
        version: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      'customer creation payload'
    );
    return new Customer(parsed);
  }

  public static fromSnapshot(raw: unknown): Customer {
    const parsed = parseWithCustomerSchema(CustomerSnapshotSchema, raw, 'customer snapshot');
    return new Customer(parsed);
  }

  get code(): string | undefined { return this._code; }
  get type(): CustomerType { return this._type; }
  get status(): CustomerStatus { return this._status; }
  get displayName(): string { return this._displayName; }
  get firstName(): string | undefined { return this._firstName; }
  get lastName(): string | undefined { return this._lastName; }
  get email(): string | undefined { return this._email; }
  get phone(): string | undefined { return this._phone; }
  get taxProfile(): CustomerTaxProfile | undefined {
    return this._taxProfile ? { ...this._taxProfile } : undefined;
  }
  get addresses(): ReadonlyArray<CustomerAddress> {
    return this._addresses.map((a) => ({ ...a }));
  }
  get segments(): ReadonlyArray<string> { return [...this._segments]; }
  get tags(): ReadonlyArray<string> { return [...this._tags]; }
  get marketingConsent(): boolean { return this._marketingConsent; }
  get notes(): string | undefined { return this._notes; }
  get metadata(): CustomerMetadata | undefined {
    return this._metadata ? { ...this._metadata } : undefined;
  }
  get creditLimitCents(): number { return this._creditLimitCents; }
  get creditTermDays(): number { return this._creditTermDays; }
  get creditBalanceCents(): number { return this._creditBalanceCents; }
  get availableCreditCents(): number {
    return Math.max(0, this._creditLimitCents - this._creditBalanceCents);
  }
  get creditFrozen(): boolean { return this._creditFrozen; }
  get creditFreezeReason(): string | undefined { return this._creditFreezeReason; }
  get creditLedger(): ReadonlyArray<CreditLedgerEntry> {
    return this._creditLedger.map((e) => ({ ...e }));
  }
  get walletBalanceCents(): number { return this._walletBalanceCents; }
  get walletLedger(): ReadonlyArray<WalletLedgerEntry> {
    return this._walletLedger.map((e) => ({ ...e }));
  }
  get loyaltyTierCode(): string { return this._loyaltyTierCode; }
  get loyaltyPointsBalance(): number { return this._loyaltyPointsBalance; }
  get loyaltyLifetimePoints(): number { return this._loyaltyLifetimePoints; }
  get loyaltyLots(): ReadonlyArray<LoyaltyLot> {
    return this._loyaltyLots.map((l) => ({ ...l }));
  }
  get loyaltyLedger(): ReadonlyArray<LoyaltyLedgerEntry> {
    return this._loyaltyLedger.map((e) => ({ ...e }));
  }
  get version(): number { return this._version; }
  get persistedVersion(): number { return this._persistedVersion; }
  get updatedAt(): string { return this._updatedAt; }
  get anonymizedAt(): string | undefined { return this._anonymizedAt; }

  public hasProcessedOperation(key: string, scope?: string): boolean {
    const clean = key.trim();
    if (!scope) {
      if (this._processedOperationKeys.has(clean)) return true;
      for (const stored of this._processedOperationKeys) {
        if (stored.endsWith(`:${clean}`)) return true;
      }
      return false;
    }
    return this._processedOperationKeys.has(`${scope}:${clean}`);
  }

  private assertActive(): void {
    if (this._status !== 'ACTIVE') {
      throw new CustomerBlockedError(this.id, this._status);
    }
  }

  private assertCurrencyMatch(currency?: string): void {
    if (currency === undefined) return;
    const normalized = parseWithCustomerSchema(CurrencyCodeSchema, currency, 'currency');
    if (normalized !== this.currency) {
      throw new CurrencyMismatchError(this.currency, normalized);
    }
  }

  private touch(now: Date, operationKey?: string, scope?: string): void {
    this._version += 1;
    this._updatedAt = now.toISOString();
    if (operationKey?.trim()) {
      const clean = operationKey.trim();
      this._processedOperationKeys.add(scope ? `${scope}:${clean}` : clean);
    }
  }

  public markPersisted(): void {
    this._persistedVersion = this._version;
  }

  public updateProfile(
    patch: {
      code?: string;
      type?: CustomerType;
      displayName?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      taxProfile?: CustomerTaxProfile;
      marketingConsent?: boolean;
      notes?: string;
      metadata?: CustomerMetadata;
    },
    now = new Date(),
    flags?: CustomerFeatureFlags
  ): void {
    if (this._status === 'ANONYMIZED') {
      throw new CustomerBlockedError(this.id, this._status);
    }
    if (patch.code !== undefined) this._code = patch.code.trim() || undefined;
    if (patch.type !== undefined && isCustomerFeatureEnabled(flags, 'customerTypes')) {
      this._type = patch.type;
    }
    if (patch.displayName !== undefined) {
      const trimmed = patch.displayName.trim();
      if (!trimmed) throw new InvalidCustomerInputError('displayName cannot be empty.');
      this._displayName = trimmed;
    }
    if (patch.firstName !== undefined) this._firstName = patch.firstName.trim() || undefined;
    if (patch.lastName !== undefined) this._lastName = patch.lastName.trim() || undefined;
    if (patch.email !== undefined) {
      const trimmedEmail = patch.email.trim();
      this._email = trimmedEmail ? parseWithCustomerSchema(EmailSchema, trimmedEmail, 'email') : undefined;
    }
    if (patch.phone !== undefined) this._phone = patch.phone.trim() || undefined;
    if (patch.taxProfile !== undefined && isCustomerFeatureEnabled(flags, 'customerTypes')) {
      this._taxProfile = parseWithCustomerSchema(
        CustomerTaxProfileSchema,
        patch.taxProfile,
        'taxProfile'
      );
    }
    if (patch.marketingConsent !== undefined) this._marketingConsent = patch.marketingConsent;
    if (patch.notes !== undefined) this._notes = patch.notes.trim() || undefined;
    if (patch.metadata !== undefined) {
      this._metadata = parseWithCustomerSchema(CustomerMetadataSchema, patch.metadata, 'metadata');
    }

    this.touch(now);
  }

  public upsertAddress(address: CustomerAddress, now = new Date(), maxAddresses = 25): void {
    this.assertActive();
    const parsedAddress = parseWithCustomerSchema(CustomerAddressSchema, address, 'customer address');
    const existingIdx = this._addresses.findIndex((a) => a.id === parsedAddress.id);
    if (parsedAddress.isDefault) {
      this._addresses = this._addresses.map((a) => ({ ...a, isDefault: false }));
    }
    if (existingIdx >= 0) {
      this._addresses[existingIdx] = parsedAddress;
    } else {
      if (this._addresses.length >= maxAddresses) {
        throw new InvalidCustomerInputError(`Maximum number of addresses (${maxAddresses}) reached.`);
      }
      this._addresses.push(parsedAddress);
    }
    this.touch(now);
  }

  public removeAddress(addressId: string, now = new Date()): boolean {
    this.assertActive();
    const before = this._addresses.length;
    this._addresses = this._addresses.filter((a) => a.id !== addressId);
    if (this._addresses.length === before) return false;
    this.touch(now);
    return true;
  }

  public setSegmentsAndTags(
    params: { segments?: string[]; tags?: string[] },
    now = new Date()
  ): void {
    this.assertActive();
    if (params.segments !== undefined) {
      this._segments = Array.from(new Set(params.segments.map((s) => s.trim()).filter(Boolean)));
    }
    if (params.tags !== undefined) {
      this._tags = Array.from(new Set(params.tags.map((t) => t.trim()).filter(Boolean)));
    }
    this.touch(now);
  }

  public setStatus(status: Exclude<CustomerStatus, 'ANONYMIZED'>, now = new Date()): void {
    if (this._status === 'ANONYMIZED') {
      throw new CustomerBlockedError(this.id, this._status);
    }
    this._status = status;
    this.touch(now);
  }

  public configureCredit(
    params: { creditLimitCents: number; creditTermDays?: number },
    now = new Date()
  ): void {
    this.assertActive();
    if (!Number.isSafeInteger(params.creditLimitCents) || params.creditLimitCents < 0) {
      throw new InvalidCustomerInputError('creditLimitCents must be a non-negative integer.');
    }
    if (
      params.creditTermDays !== undefined &&
      (!Number.isSafeInteger(params.creditTermDays) || params.creditTermDays < 0)
    ) {
      throw new InvalidCustomerInputError('creditTermDays must be a non-negative integer.');
    }
    this._creditLimitCents = params.creditLimitCents;
    if (params.creditTermDays !== undefined) {
      this._creditTermDays = params.creditTermDays;
    }
    this.touch(now);
  }

  public freezeCredit(reason: string, now = new Date()): void {
    if (this._status === 'ANONYMIZED') {
      throw new CustomerBlockedError(this.id, this._status);
    }
    this._creditFrozen = true;
    this._creditFreezeReason = reason.trim() || 'Frozen';
    this.touch(now);
  }

  public unfreezeCredit(now = new Date()): void {
    if (this._status === 'ANONYMIZED') {
      throw new CustomerBlockedError(this.id, this._status);
    }
    this._creditFrozen = false;
    this._creditFreezeReason = undefined;
    this.touch(now);
  }

  public getCreditAging(asOf = new Date()): CreditAgingSummary {
    return calculateCreditAging(this._creditLedger, asOf);
  }

  public recordCreditCharge(params: {
    entryId: string;
    amountCents: number;
    currency?: string;
    referenceId?: string;
    dueAt?: Date;
    notes?: string;
    performedBy?: string;
    idempotencyKey?: string;
    enforceOverdueHold?: boolean;
    now?: Date;
  }): CreditLedgerEntry | null {
    this.assertActive();
    this.assertCurrencyMatch(params.currency);
    const now = params.now ?? new Date();
    if (params.idempotencyKey && this.hasProcessedOperation(params.idempotencyKey, 'credit:charge')) {
      return this._creditLedger.find((e) => e.idempotencyKey === params.idempotencyKey) ?? null;
    }
    if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
      throw new InvalidCustomerInputError('Credit charge amountCents must be a positive integer.');
    }
    if (this._creditFrozen) {
      throw new CreditAccountFrozenError(this.id, this._creditFreezeReason);
    }
    if (params.enforceOverdueHold) {
      const aging = this.getCreditAging(now);
      if (aging.totalOverdueCents > 0) {
        throw new CreditAccountFrozenError(
          this.id,
          `Customer has ${aging.totalOverdueCents} cents overdue.`
        );
      }
    }
    const available = this.availableCreditCents;
    if (params.amountCents > available) {
      throw new CreditLimitExceededError(this.id, params.amountCents, available);
    }

    const dueDate =
      params.dueAt ??
      (this._creditTermDays > 0
        ? new Date(now.getTime() + this._creditTermDays * 86_400_000)
        : undefined);

    this._creditBalanceCents += params.amountCents;
    const entry: CreditLedgerEntry = {
      id: params.entryId,
      type: 'CHARGE',
      amountCents: params.amountCents,
      balanceAfterCents: this._creditBalanceCents,
      referenceId: params.referenceId,
      dueAt: dueDate?.toISOString(),
      settledCents: 0,
      notes: params.notes,
      performedBy: params.performedBy,
      idempotencyKey: params.idempotencyKey,
      occurredAt: now.toISOString(),
    };
    this._creditLedger.push(entry);
    this.touch(now, params.idempotencyKey, 'credit:charge');
    return { ...entry };
  }

  public recordCreditPayment(params: {
    entryId: string;
    amountCents: number;
    currency?: string;
    type?: 'PAYMENT' | 'ADJUSTMENT_CREDIT' | 'WRITE_OFF';
    referenceId?: string;
    notes?: string;
    performedBy?: string;
    idempotencyKey?: string;
    now?: Date;
  }): CreditLedgerEntry | null {
    if (this._status === 'ANONYMIZED') {
      throw new CustomerBlockedError(this.id, this._status);
    }
    this.assertCurrencyMatch(params.currency);
    const now = params.now ?? new Date();
    if (params.idempotencyKey && this.hasProcessedOperation(params.idempotencyKey, 'credit:payment')) {
      return this._creditLedger.find((e) => e.idempotencyKey === params.idempotencyKey) ?? null;
    }
    if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
      throw new InvalidCustomerInputError('Credit payment amountCents must be a positive integer.');
    }
    if (params.amountCents > this._creditBalanceCents) {
      throw new InsufficientCreditBalanceError(this.id, params.amountCents, this._creditBalanceCents);
    }

    // Settle oldest open charges FIFO so credit aging stays accurate.
    let remainingToSettle = params.amountCents;
    for (const ledgerEntry of this._creditLedger) {
      if (remainingToSettle <= 0) break;
      if (ledgerEntry.type !== 'CHARGE' && ledgerEntry.type !== 'ADJUSTMENT_DEBIT') continue;
      const open = ledgerEntry.amountCents - ledgerEntry.settledCents;
      if (open <= 0) continue;
      const settle = Math.min(open, remainingToSettle);
      ledgerEntry.settledCents += settle;
      remainingToSettle -= settle;
    }

    this._creditBalanceCents -= params.amountCents;
    const entry: CreditLedgerEntry = {
      id: params.entryId,
      type: params.type ?? 'PAYMENT',
      amountCents: params.amountCents,
      balanceAfterCents: this._creditBalanceCents,
      referenceId: params.referenceId,
      settledCents: params.amountCents,
      notes: params.notes,
      performedBy: params.performedBy,
      idempotencyKey: params.idempotencyKey,
      occurredAt: now.toISOString(),
    };
    this._creditLedger.push(entry);
    this.touch(now, params.idempotencyKey, 'credit:payment');
    return { ...entry };
  }

  public depositWallet(params: {
    entryId: string;
    amountCents: number;
    currency?: string;
    type?: 'DEPOSIT' | 'REFUND_CREDIT';
    referenceId?: string;
    notes?: string;
    idempotencyKey?: string;
    now?: Date;
  }): WalletLedgerEntry | null {
    this.assertActive();
    this.assertCurrencyMatch(params.currency);
    const now = params.now ?? new Date();
    if (params.idempotencyKey && this.hasProcessedOperation(params.idempotencyKey, 'wallet:deposit')) {
      return this._walletLedger.find((e) => e.idempotencyKey === params.idempotencyKey) ?? null;
    }
    if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
      throw new InvalidCustomerInputError('Wallet deposit amountCents must be a positive integer.');
    }
    this._walletBalanceCents += params.amountCents;
    const entry: WalletLedgerEntry = {
      id: params.entryId,
      type: params.type ?? 'DEPOSIT',
      amountCents: params.amountCents,
      balanceAfterCents: this._walletBalanceCents,
      referenceId: params.referenceId,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      occurredAt: now.toISOString(),
    };
    this._walletLedger.push(entry);
    this.touch(now, params.idempotencyKey, 'wallet:deposit');
    return { ...entry };
  }

  public spendWallet(params: {
    entryId: string;
    amountCents: number;
    currency?: string;
    referenceId?: string;
    notes?: string;
    idempotencyKey?: string;
    now?: Date;
  }): WalletLedgerEntry | null {
    this.assertActive();
    this.assertCurrencyMatch(params.currency);
    const now = params.now ?? new Date();
    if (params.idempotencyKey && this.hasProcessedOperation(params.idempotencyKey, 'wallet:spend')) {
      return this._walletLedger.find((e) => e.idempotencyKey === params.idempotencyKey) ?? null;
    }
    if (!Number.isSafeInteger(params.amountCents) || params.amountCents <= 0) {
      throw new InvalidCustomerInputError('Wallet spend amountCents must be a positive integer.');
    }
    if (params.amountCents > this._walletBalanceCents) {
      throw new InsufficientWalletBalanceError(
        this.id,
        params.amountCents,
        this._walletBalanceCents
      );
    }
    this._walletBalanceCents -= params.amountCents;
    const entry: WalletLedgerEntry = {
      id: params.entryId,
      type: 'WITHDRAWAL',
      amountCents: params.amountCents,
      balanceAfterCents: this._walletBalanceCents,
      referenceId: params.referenceId,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      occurredAt: now.toISOString(),
    };
    this._walletLedger.push(entry);
    this.touch(now, params.idempotencyKey, 'wallet:spend');
    return { ...entry };
  }

  public earnLoyaltyFromPurchase(params: {
    entryId: string;
    lotId: string;
    spentCents: number;
    policy?: LoyaltyPolicy;
    applyTiers?: boolean;
    enableExpiration?: boolean;
    referenceId?: string;
    notes?: string;
    idempotencyKey?: string;
    now?: Date;
  }): { pointsEarned: number; tierCode: string; entry: LoyaltyLedgerEntry | null } {
    this.assertActive();
    const now = params.now ?? new Date();
    const policy = params.policy ?? DEFAULT_LOYALTY_POLICY;

    if (params.idempotencyKey && this.hasProcessedOperation(params.idempotencyKey, 'loyalty:earn')) {
      const existing = this._loyaltyLedger.find((e) => e.idempotencyKey === params.idempotencyKey) ?? null;
      return {
        pointsEarned: existing?.pointsDelta ?? 0,
        tierCode: this._loyaltyTierCode,
        entry: existing,
      };
    }

    const { points } = calculatePointsToEarn({
      spentCents: params.spentCents,
      policy,
      lifetimePoints: this._loyaltyLifetimePoints,
      applyTiers: params.applyTiers ?? true,
    });

    if (points === 0) {
      return { pointsEarned: 0, tierCode: this._loyaltyTierCode, entry: null };
    }

    this._loyaltyPointsBalance += points;
    this._loyaltyLifetimePoints += points;
    if (params.applyTiers ?? true) {
      this._loyaltyTierCode = resolveLoyaltyTier(this._loyaltyLifetimePoints, policy.tiers).code;
    }

    const expiresAt =
      (params.enableExpiration ?? true) && policy.pointsExpirationDays
        ? new Date(now.getTime() + policy.pointsExpirationDays * 86_400_000).toISOString()
        : undefined;

    this._loyaltyLots.push({
      id: params.lotId,
      earnedPoints: points,
      remainingPoints: points,
      earnedAt: now.toISOString(),
      expiresAt,
      referenceId: params.referenceId,
    });

    const entry: LoyaltyLedgerEntry = {
      id: params.entryId,
      type: 'EARN',
      pointsDelta: points,
      balanceAfter: this._loyaltyPointsBalance,
      referenceId: params.referenceId,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      occurredAt: now.toISOString(),
    };
    this._loyaltyLedger.push(entry);
    this.touch(now, params.idempotencyKey, 'loyalty:earn');

    return { pointsEarned: points, tierCode: this._loyaltyTierCode, entry: { ...entry } };
  }

  public redeemLoyaltyPoints(params: {
    entryId: string;
    pointsToRedeem: number;
    purchaseAmountCents?: number;
    policy?: LoyaltyPolicy;
    referenceId?: string;
    notes?: string;
    idempotencyKey?: string;
    now?: Date;
  }): { redeemedPoints: number; discountCents: number; entry: LoyaltyLedgerEntry | null } {
    this.assertActive();
    const now = params.now ?? new Date();
    const policy = params.policy ?? DEFAULT_LOYALTY_POLICY;

    if (params.idempotencyKey && this.hasProcessedOperation(params.idempotencyKey, 'loyalty:redeem')) {
      const existing = this._loyaltyLedger.find((e) => e.idempotencyKey === params.idempotencyKey) ?? null;
      const pts = existing ? Math.abs(existing.pointsDelta) : params.pointsToRedeem;
      return {
        redeemedPoints: pts,
        discountCents: existing?.discountCents ?? pts * policy.centsPerPointRedeemed,
        entry: existing,
      };
    }

    const discountCents = calculateRedemptionValueCents({
      pointsToRedeem: params.pointsToRedeem,
      policy,
      purchaseAmountCents: params.purchaseAmountCents,
    });

    // Calculate non-expired lot points plus any legacy un-lotted points.
    const nowMs = now.getTime();
    let totalInAllLots = 0;
    let nonExpiredInLots = 0;
    for (const lot of this._loyaltyLots) {
      if (lot.remainingPoints <= 0) continue;
      totalInAllLots += lot.remainingPoints;
      if (!lot.expiresAt || new Date(lot.expiresAt).getTime() > nowMs) {
        nonExpiredInLots += lot.remainingPoints;
      }
    }
    const unlottedLegacyBalance = Math.max(0, this._loyaltyPointsBalance - totalInAllLots);
    const effectiveAvailable = Math.min(this._loyaltyPointsBalance, nonExpiredInLots + unlottedLegacyBalance);

    if (params.pointsToRedeem > effectiveAvailable) {
      throw new InsufficientLoyaltyPointsError(
        this.id,
        params.pointsToRedeem,
        effectiveAvailable
      );
    }

    // Consume points FIFO across non-expired lots only (never redeem expired lots).
    let remaining = params.pointsToRedeem;
    for (const lot of this._loyaltyLots) {
      if (remaining <= 0) break;
      if (lot.remainingPoints <= 0) continue;
      if (lot.expiresAt && new Date(lot.expiresAt).getTime() <= nowMs) continue;
      const take = Math.min(lot.remainingPoints, remaining);
      lot.remainingPoints -= take;
      remaining -= take;
    }

    this._loyaltyPointsBalance -= params.pointsToRedeem;
    const entry: LoyaltyLedgerEntry = {
      id: params.entryId,
      type: 'REDEEM',
      pointsDelta: -params.pointsToRedeem,
      balanceAfter: this._loyaltyPointsBalance,
      discountCents,
      referenceId: params.referenceId,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      occurredAt: now.toISOString(),
    };
    this._loyaltyLedger.push(entry);
    this.touch(now, params.idempotencyKey, 'loyalty:redeem');

    return { redeemedPoints: params.pointsToRedeem, discountCents, entry: { ...entry } };
  }

  public expireLoyaltyPoints(entryId: string, asOf = new Date()): number {
    const asOfMs = asOf.getTime();
    let expiredTotal = 0;

    for (const lot of this._loyaltyLots) {
      if (lot.remainingPoints > 0 && lot.expiresAt && new Date(lot.expiresAt).getTime() <= asOfMs) {
        expiredTotal += lot.remainingPoints;
        lot.remainingPoints = 0;
      }
    }

    if (expiredTotal <= 0) {
      return 0;
    }

    const actualDeduction = Math.min(expiredTotal, this._loyaltyPointsBalance);
    this._loyaltyPointsBalance -= actualDeduction;

    this._loyaltyLedger.push({
      id: entryId,
      type: 'EXPIRE',
      pointsDelta: -actualDeduction,
      balanceAfter: this._loyaltyPointsBalance,
      notes: 'Expired loyalty points',
      occurredAt: asOf.toISOString(),
    });
    this.touch(asOf);
    return actualDeduction;
  }

  public anonymizePii(now = new Date()): void {
    if (this._status === 'ANONYMIZED') {
      return;
    }
    if (this._creditBalanceCents > 0 || this._walletBalanceCents > 0) {
      throw new CustomerBalanceNotSettledError(
        this.id,
        `creditBalance=${this._creditBalanceCents} cents, walletBalance=${this._walletBalanceCents} cents.`
      );
    }

    this._status = 'ANONYMIZED';
    this._code = undefined;
    this._displayName = `ANONYMIZED-${this.id}`;
    this._firstName = undefined;
    this._lastName = undefined;
    this._email = undefined;
    this._phone = undefined;
    this._taxProfile = undefined;
    this._addresses = [];
    this._segments = [];
    this._tags = [];
    this._notes = undefined;
    this._metadata = undefined;
    this._marketingConsent = false;
    this._creditLedger = this._creditLedger.map((e) => ({
      ...e,
      notes: undefined,
      performedBy: undefined,
    }));
    this._walletLedger = this._walletLedger.map((e) => ({
      ...e,
      notes: undefined,
    }));
    this._loyaltyLedger = this._loyaltyLedger.map((e) => ({
      ...e,
      notes: undefined,
    }));
    this._anonymizedAt = now.toISOString();
    this.touch(now);
  }

  public toPublicSummary(): CustomerPublicSummary {
    return {
      id: this.id,
      code: this._code,
      type: this._type,
      status: this._status,
      displayName: this._displayName,
      email: this._email,
      phone: this._phone,
      currency: this.currency,
      creditLimitCents: this._creditLimitCents,
      creditBalanceCents: this._creditBalanceCents,
      availableCreditCents: this.availableCreditCents,
      creditFrozen: this._creditFrozen,
      walletBalanceCents: this._walletBalanceCents,
      loyaltyTierCode: this._loyaltyTierCode,
      loyaltyPointsBalance: this._loyaltyPointsBalance,
      version: this._version,
    };
  }

  public toSnapshot(): CustomerSnapshot {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      code: this._code,
      type: this._type,
      status: this._status,
      displayName: this._displayName,
      firstName: this._firstName,
      lastName: this._lastName,
      email: this._email,
      phone: this._phone,
      currency: this.currency,
      taxProfile: this._taxProfile ? { ...this._taxProfile } : undefined,
      addresses: this._addresses.map((a) => ({ ...a })),
      segments: [...this._segments],
      tags: [...this._tags],
      marketingConsent: this._marketingConsent,
      notes: this._notes,
      metadata: this._metadata ? { ...this._metadata } : undefined,
      creditLimitCents: this._creditLimitCents,
      creditTermDays: this._creditTermDays,
      creditBalanceCents: this._creditBalanceCents,
      creditFrozen: this._creditFrozen,
      creditFreezeReason: this._creditFreezeReason,
      creditLedger: this._creditLedger.map((e) => ({ ...e })),
      walletBalanceCents: this._walletBalanceCents,
      walletLedger: this._walletLedger.map((e) => ({ ...e })),
      loyaltyTierCode: this._loyaltyTierCode,
      loyaltyPointsBalance: this._loyaltyPointsBalance,
      loyaltyLifetimePoints: this._loyaltyLifetimePoints,
      loyaltyLots: this._loyaltyLots.map((l) => ({ ...l })),
      loyaltyLedger: this._loyaltyLedger.map((e) => ({ ...e })),
      processedOperationKeys: Array.from(this._processedOperationKeys),
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      anonymizedAt: this._anonymizedAt,
    };
  }
}

import { describe, expect, it } from 'vitest';
import {
  AnonymizeCustomerUseCase,
  ConcurrencyError,
  CreateCustomerUseCase,
  Customer,
  CustomerBalanceNotSettledError,
  CustomerBlockedError,
  CustomerDomainEvent,
  DuplicateCustomerError,
  FeatureDisabledError,
  InMemoryCustomerRepository,
  InvalidCustomerInputError,
  ManageCustomerCreditUseCase,
  SearchCustomersUseCase,
  UpdateCustomerUseCase,
} from '../src/index.js';

class ManualClock {
  private ms: number;
  constructor(iso = '2026-11-19T12:00:00.000Z') {
    this.ms = new Date(iso).getTime();
  }
  now(): Date {
    return new Date(this.ms);
  }
  advanceDays(days: number): void {
    this.ms += days * 86_400_000;
  }
}

describe('@modulos/core-customers: Directory, Profiles, Feature Flags & Privacy', () => {
  it('creates, updates, searches, and enforces unique code/email/taxId & optimistic concurrency', async () => {
    const repo = new InMemoryCustomerRepository({ isolate: true });
    const clock = new ManualClock();
    const events: CustomerDomainEvent[] = [];

    const create = new CreateCustomerUseCase({
      customerRepo: repo,
      clock,
      publishEvent: (e) => {
        events.push(e);
      },
      featureProfile: 'ADVANCED',
    });

    const c1 = await create.execute({
      id: 'cust-1',
      code: 'CLI-001',
      type: 'BUSINESS',
      displayName: 'Ferretería El Martillo',
      email: 'CONTACTO@Martillo.MX',
      taxProfile: { taxId: 'fem010101abc', legalName: 'Ferretería El Martillo SA de CV' },
      segments: ['VIP', 'WHOLESALE'],
      tags: ['ferreteria'],
      creditLimitCents: 100_000,
      creditTermDays: 30,
    });

    expect(c1.email).toBe('contacto@martillo.mx');
    expect(c1.creditLimitCents).toBe(100_000);
    expect(events[0]?.type).toBe('CustomerCreated');

    await expect(
      create.execute({
        id: 'cust-2',
        code: 'cli-001',
        displayName: 'Duplicate Code',
      })
    ).rejects.toThrow(DuplicateCustomerError);

    await expect(
      create.execute({
        id: 'cust-2',
        displayName: 'Duplicate Tax',
        type: 'BUSINESS',
        taxProfile: { taxId: 'FEM010101ABC', legalName: 'Otra' },
      })
    ).rejects.toThrow(DuplicateCustomerError);

    const update = new UpdateCustomerUseCase({ customerRepo: repo, clock, featureProfile: 'ADVANCED' });
    const updated = await update.execute({
      customerId: 'cust-1',
      upsertAddress: {
        id: 'addr-1',
        kind: 'BILLING',
        line1: 'Av. Reforma 123',
        city: 'CDMX',
        postalCode: '06000',
        countryCode: 'MX',
        isDefault: true,
      },
      expectedVersion: c1.version,
    });
    expect(updated.version).toBe(1);

    // Stale expectedVersion triggers ConcurrencyError
    await expect(
      update.execute({
        customerId: 'cust-1',
        displayName: 'Stale Write',
        expectedVersion: 0,
      })
    ).rejects.toThrow(ConcurrencyError);

    const search = new SearchCustomersUseCase(repo);
    const vipResults = await search.execute({ segment: 'VIP', query: 'martillo' });
    expect(vipResults).toHaveLength(1);
    expect(vipResults[0]?.id).toBe('cust-1');
  });

  it('enforces BASIC feature flags by blocking advanced capabilities', async () => {
    const repo = new InMemoryCustomerRepository({ isolate: true });
    const createBasic = new CreateCustomerUseCase({
      customerRepo: repo,
      featureProfile: 'BASIC',
    });

    await expect(
      createBasic.execute({
        id: 'c-basic-fail',
        displayName: 'Empresa',
        type: 'BUSINESS',
      })
    ).rejects.toThrow(FeatureDisabledError);

    const basicCustomer = await createBasic.execute({
      id: 'c-basic-ok',
      displayName: 'Juan Pérez',
    });
    expect(basicCustomer.type).toBe('INDIVIDUAL');

    const creditUc = new ManageCustomerCreditUseCase({
      customerRepo: repo,
      featureProfile: 'BASIC',
    });
    await expect(
      creditUc.configureCredit({ customerId: 'c-basic-ok', creditLimitCents: 5000 })
    ).rejects.toThrow(FeatureDisabledError);
  });

  it('blocks GDPR anonymization when balances are unsettled, and succeeds once settled', async () => {
    const repo = new InMemoryCustomerRepository({ isolate: true });
    const clock = new ManualClock();
    const create = new CreateCustomerUseCase({ customerRepo: repo, clock });
    const credit = new ManageCustomerCreditUseCase({ customerRepo: repo, clock });
    const anonymize = new AnonymizeCustomerUseCase({ customerRepo: repo, clock });

    await create.execute({
      id: 'c-gdpr',
      displayName: 'Ana Torres',
      email: 'ana@example.com',
      creditLimitCents: 50_000,
    });
    await credit.charge({ customerId: 'c-gdpr', amountCents: 10_000, referenceId: 'ORD-1' });

    await expect(anonymize.execute('c-gdpr')).rejects.toThrow(CustomerBalanceNotSettledError);

    await credit.recordPayment({ customerId: 'c-gdpr', amountCents: 10_000, referenceId: 'PAY-1' });
    const anon = await anonymize.execute('c-gdpr');
    expect(anon.status).toBe('ANONYMIZED');
    expect(anon.displayName).toBe('ANONYMIZED-c-gdpr');
    expect(anon.email).toBeUndefined();

    const update = new UpdateCustomerUseCase({ customerRepo: repo, clock });
    await expect(update.execute({ customerId: 'c-gdpr', displayName: 'New' })).rejects.toThrow(
      CustomerBlockedError
    );
  });

  it('validates schemaVersion and corrupted snapshots with Zod v4', () => {
    const c = Customer.create({ id: 'c-snap', displayName: 'Snapshot Test' });
    const snap = c.toSnapshot();
    expect(snap.schemaVersion).toBe(1);
    expect(Customer.fromSnapshot(snap).id).toBe('c-snap');
    expect(() => Customer.fromSnapshot({ ...snap, schemaVersion: 99 })).toThrow(
      InvalidCustomerInputError
    );
    expect(() => Customer.fromSnapshot({ id: 'bad', email: 'not-email' })).toThrow(
      InvalidCustomerInputError
    );
  });
});

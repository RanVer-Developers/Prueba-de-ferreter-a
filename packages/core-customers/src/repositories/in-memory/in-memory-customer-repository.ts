import { CustomerSearchFilter, ICustomerRepository } from '../../contracts/customer-contracts.js';
import { Customer } from '../../domain/entities/customer.js';
import { ConcurrencyError } from '../../domain/errors/customer-errors.js';
import { CustomerSnapshot } from '../../schemas/customer.schemas.js';

export interface InMemoryCustomerRepositoryOptions {
  isolate?: boolean;
}

export class InMemoryCustomerRepository implements ICustomerRepository {
  private readonly items = new Map<string, Customer>();
  private readonly snapshots = new Map<string, CustomerSnapshot>();
  private readonly isolate: boolean;

  constructor(options: InMemoryCustomerRepositoryOptions = {}) {
    this.isolate = options.isolate ?? true;
  }

  private clone(customer: Customer): Customer {
    return Customer.fromSnapshot(JSON.parse(JSON.stringify(customer.toSnapshot())));
  }

  private listAll(): Customer[] {
    if (this.isolate) {
      return Array.from(this.snapshots.values()).map((s) =>
        Customer.fromSnapshot(JSON.parse(JSON.stringify(s)))
      );
    }
    return Array.from(this.items.values());
  }

  public async findById(id: string): Promise<Customer | null> {
    if (this.isolate) {
      const snap = this.snapshots.get(id);
      return snap ? Customer.fromSnapshot(JSON.parse(JSON.stringify(snap))) : null;
    }
    return this.items.get(id) ?? null;
  }

  public async findByCode(code: string): Promise<Customer | null> {
    const normalized = code.trim().toLowerCase();
    for (const c of this.listAll()) {
      if (c.code?.toLowerCase() === normalized) return c;
    }
    return null;
  }

  public async findByEmail(email: string): Promise<Customer | null> {
    const normalized = email.trim().toLowerCase();
    for (const c of this.listAll()) {
      if (c.email?.toLowerCase() === normalized) return c;
    }
    return null;
  }

  public async findByTaxId(taxId: string): Promise<Customer | null> {
    const normalized = taxId.trim().toUpperCase();
    for (const c of this.listAll()) {
      if (c.taxProfile?.taxId.toUpperCase() === normalized) return c;
    }
    return null;
  }

  public async search(filter: CustomerSearchFilter = {}): Promise<Customer[]> {
    const q = filter.query?.trim().toLowerCase();
    const filtered = this.listAll().filter((c) => {
      if (filter.status && c.status !== filter.status) return false;
      if (filter.type && c.type !== filter.type) return false;
      if (filter.segment && !c.segments.includes(filter.segment)) return false;
      if (filter.tag && !c.tags.includes(filter.tag)) return false;
      if (filter.hasCreditBalance && c.creditBalanceCents <= 0) return false;
      if (q) {
        const hay = [
          c.id,
          c.code ?? '',
          c.displayName,
          c.email ?? '',
          c.phone ?? '',
          c.taxProfile?.taxId ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const offset = Math.max(0, filter.offset ?? 0);
    const limit = Math.max(1, filter.limit ?? 50);
    return filtered.slice(offset, offset + limit);
  }

  public async save(customer: Customer, expectedVersion?: number): Promise<void> {
    if (this.isolate) {
      const existing = this.snapshots.get(customer.id);
      const expected = expectedVersion ?? customer.persistedVersion;
      if (existing && existing.version !== expected) {
        throw new ConcurrencyError(customer.id, expected, existing.version);
      }
      this.snapshots.set(customer.id, JSON.parse(JSON.stringify(customer.toSnapshot())));
      customer.markPersisted();
      return;
    }
    this.items.set(customer.id, this.clone(customer));
    customer.markPersisted();
  }
}

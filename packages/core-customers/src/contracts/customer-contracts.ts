import { generateId } from '@modulos/core-shared';
import { Customer } from '../domain/entities/customer.js';
import { CustomerDomainEvent } from '../domain/events/customer-events.js';
import { CustomerStatus, CustomerType } from '../schemas/customer.schemas.js';

export interface CustomerSearchFilter {
  query?: string;
  status?: CustomerStatus;
  type?: CustomerType;
  segment?: string;
  tag?: string;
  hasCreditBalance?: boolean;
  limit?: number;
  offset?: number;
}

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByCode(code: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  findByTaxId(taxId: string): Promise<Customer | null>;
  search(filter?: CustomerSearchFilter): Promise<Customer[]>;
  save(customer: Customer, expectedVersion?: number): Promise<void>;
}

export interface IClock {
  now(): Date;
}

export const SystemClock: IClock = {
  now: () => new Date(),
};

export interface IIdGenerator {
  nextId(prefix?: string): string;
}

export const DefaultIdGenerator: IIdGenerator = {
  nextId: (prefix = 'cust') => generateId(prefix),
};

export type CustomerEventPublisher = (event: CustomerDomainEvent) => Promise<void> | void;

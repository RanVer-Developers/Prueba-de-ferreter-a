import { z } from 'zod';
import { CustomerSearchFilter, ICustomerRepository } from '../contracts/customer-contracts.js';
import { CustomerPublicSummary } from '../domain/entities/customer.js';
import {
  CustomerStatusSchema,
  CustomerTypeSchema,
  parseWithCustomerSchema,
} from '../schemas/customer.schemas.js';

const SearchCustomersFilterSchema = z.object({
  query: z.string().trim().optional(),
  status: CustomerStatusSchema.optional(),
  type: CustomerTypeSchema.optional(),
  segment: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  hasCreditBalance: z.boolean().optional(),
  limit: z.number().int().positive().max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

export class SearchCustomersUseCase {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  public async execute(filter: CustomerSearchFilter = {}): Promise<CustomerPublicSummary[]> {
    const parsed = parseWithCustomerSchema(SearchCustomersFilterSchema, filter, 'search customers filter');
    const customers = await this.customerRepo.search(parsed);
    return customers.map((c) => c.toPublicSummary());
  }
}

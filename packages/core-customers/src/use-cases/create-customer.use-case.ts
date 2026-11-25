import { z } from 'zod';
import {
  CustomerEventPublisher,
  IClock,
  ICustomerRepository,
  SystemClock,
} from '../contracts/customer-contracts.js';
import { Customer, CustomerPublicSummary } from '../domain/entities/customer.js';
import { DuplicateCustomerError } from '../domain/errors/customer-errors.js';
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  assertCustomerFeatureEnabled,
  resolveCustomerFeatures,
} from '../domain/services/customer-features.js';
import {
  CurrencyCodeSchema,
  CustomerAddressSchema,
  CustomerMetadataSchema,
  CustomerTaxProfileSchema,
  CustomerTypeSchema,
  EmailSchema,
  NonEmptyIdSchema,
  parseWithCustomerSchema,
} from '../schemas/customer.schemas.js';

const CreateCustomerInputSchema = z.object({
  id: NonEmptyIdSchema,
  code: z.string().trim().min(1).optional(),
  type: CustomerTypeSchema.optional(),
  displayName: z.string().trim().min(1, 'Display name is required.'),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: EmailSchema.optional(),
  phone: z.string().trim().min(1).optional(),
  currency: CurrencyCodeSchema.default('MXN'),
  taxProfile: CustomerTaxProfileSchema.optional(),
  addresses: z.array(CustomerAddressSchema).optional(),
  segments: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  marketingConsent: z.boolean().optional(),
  notes: z.string().trim().min(1).optional(),
  metadata: CustomerMetadataSchema.optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  creditTermDays: z.number().int().min(0).optional(),
});

export type CreateCustomerInput = z.input<typeof CreateCustomerInputSchema>;

export interface CreateCustomerDeps {
  customerRepo: ICustomerRepository;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  featureProfile?: CustomerFeatureProfile;
}

export class CreateCustomerUseCase {
  private readonly clock: IClock;
  private readonly features: CustomerFeatureFlags;

  constructor(private readonly deps: CreateCustomerDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCustomerFeatures(deps.featureProfile);
  }

  public async execute(rawInput: CreateCustomerInput): Promise<CustomerPublicSummary> {
    const input = parseWithCustomerSchema(
      CreateCustomerInputSchema,
      rawInput,
      'create customer input'
    );

    if (input.type === 'BUSINESS' || input.taxProfile) {
      assertCustomerFeatureEnabled(this.features, 'customerTypes');
    }
    if (input.addresses && input.addresses.length > 1) {
      assertCustomerFeatureEnabled(this.features, 'multipleAddresses');
    }
    if ((input.segments && input.segments.length > 0) || (input.tags && input.tags.length > 0)) {
      assertCustomerFeatureEnabled(this.features, 'segmentsAndTags');
    }
    if (
      (input.creditLimitCents !== undefined && input.creditLimitCents > 0) ||
      (input.creditTermDays !== undefined && input.creditTermDays > 0)
    ) {
      assertCustomerFeatureEnabled(this.features, 'creditAccounts');
    }

    if (await this.deps.customerRepo.findById(input.id)) {
      throw new DuplicateCustomerError('id', input.id);
    }
    if (input.code && (await this.deps.customerRepo.findByCode(input.code))) {
      throw new DuplicateCustomerError('code', input.code);
    }
    if (input.email && (await this.deps.customerRepo.findByEmail(input.email))) {
      throw new DuplicateCustomerError('email', input.email);
    }
    if (input.taxProfile && (await this.deps.customerRepo.findByTaxId(input.taxProfile.taxId))) {
      throw new DuplicateCustomerError('taxId', input.taxProfile.taxId);
    }

    const now = this.clock.now();
    const customer = Customer.create({
      ...input,
      now,
      featureProfile: this.features,
    });

    await this.deps.customerRepo.save(customer);

    await this.deps.publishEvent?.({
      type: 'CustomerCreated',
      customerId: customer.id,
      displayName: customer.displayName,
      occurredAt: now.toISOString(),
    });

    return customer.toPublicSummary();
  }
}

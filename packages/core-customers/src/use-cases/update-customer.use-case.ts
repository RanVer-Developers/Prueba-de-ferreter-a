import { z } from 'zod';
import {
  CustomerEventPublisher,
  IClock,
  ICustomerRepository,
  SystemClock,
} from '../contracts/customer-contracts.js';
import { CustomerPublicSummary } from '../domain/entities/customer.js';
import { CustomerNotFoundError, DuplicateCustomerError } from '../domain/errors/customer-errors.js';
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  assertCustomerFeatureEnabled,
  isCustomerFeatureEnabled,
  resolveCustomerFeatures,
} from '../domain/services/customer-features.js';
import {
  CustomerAddressSchema,
  CustomerMetadataSchema,
  CustomerTaxProfileSchema,
  CustomerTypeSchema,
  EmailSchema,
  NonEmptyIdSchema,
  parseWithCustomerSchema,
} from '../schemas/customer.schemas.js';

const UpdateCustomerInputSchema = z.object({
  customerId: NonEmptyIdSchema,
  code: z.string().trim().min(1).optional(),
  type: CustomerTypeSchema.optional(),
  displayName: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: EmailSchema.optional(),
  phone: z.string().trim().min(1).optional(),
  taxProfile: CustomerTaxProfileSchema.optional(),
  upsertAddress: CustomerAddressSchema.optional(),
  removeAddressId: NonEmptyIdSchema.optional(),
  segments: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  marketingConsent: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  notes: z.string().trim().min(1).optional(),
  metadata: CustomerMetadataSchema.optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type UpdateCustomerInput = z.input<typeof UpdateCustomerInputSchema>;

export interface UpdateCustomerDeps {
  customerRepo: ICustomerRepository;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  featureProfile?: CustomerFeatureProfile;
}

export class UpdateCustomerUseCase {
  private readonly clock: IClock;
  private readonly features: CustomerFeatureFlags;

  constructor(private readonly deps: UpdateCustomerDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCustomerFeatures(deps.featureProfile);
  }

  public async execute(rawInput: UpdateCustomerInput): Promise<CustomerPublicSummary> {
    const input = parseWithCustomerSchema(
      UpdateCustomerInputSchema,
      rawInput,
      'update customer input'
    );

    if (input.type === 'BUSINESS' || input.taxProfile) {
      assertCustomerFeatureEnabled(this.features, 'customerTypes');
    }
    if (input.segments !== undefined || input.tags !== undefined) {
      assertCustomerFeatureEnabled(this.features, 'segmentsAndTags');
    }

    const customer = await this.deps.customerRepo.findById(input.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(input.customerId);
    }

    if (input.code && input.code.toLowerCase() !== customer.code?.toLowerCase()) {
      const dup = await this.deps.customerRepo.findByCode(input.code);
      if (dup && dup.id !== customer.id) throw new DuplicateCustomerError('code', input.code);
    }
    if (input.email && input.email !== customer.email) {
      const dup = await this.deps.customerRepo.findByEmail(input.email);
      if (dup && dup.id !== customer.id) throw new DuplicateCustomerError('email', input.email);
    }
    if (
      input.taxProfile &&
      input.taxProfile.taxId !== customer.taxProfile?.taxId
    ) {
      const dup = await this.deps.customerRepo.findByTaxId(input.taxProfile.taxId);
      if (dup && dup.id !== customer.id) {
        throw new DuplicateCustomerError('taxId', input.taxProfile.taxId);
      }
    }

    const now = this.clock.now();
    const hasProfilePatch =
      input.code !== undefined ||
      input.type !== undefined ||
      input.displayName !== undefined ||
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.email !== undefined ||
      input.phone !== undefined ||
      input.taxProfile !== undefined ||
      input.marketingConsent !== undefined ||
      input.notes !== undefined ||
      input.metadata !== undefined;

    if (hasProfilePatch) {
      customer.updateProfile(
        {
          code: input.code,
          type: input.type,
          displayName: input.displayName,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          taxProfile: input.taxProfile,
          marketingConsent: input.marketingConsent,
          notes: input.notes,
          metadata: input.metadata,
        },
        now,
        this.features
      );
    }

    if (input.upsertAddress) {
      const maxAddresses = isCustomerFeatureEnabled(this.features, 'multipleAddresses') ? 25 : 1;
      customer.upsertAddress(input.upsertAddress, now, maxAddresses);
    }
    if (input.removeAddressId) {
      customer.removeAddress(input.removeAddressId, now);
    }
    if (input.segments !== undefined || input.tags !== undefined) {
      customer.setSegmentsAndTags({ segments: input.segments, tags: input.tags }, now);
    }
    if (input.status !== undefined) {
      customer.setStatus(input.status, now);
    }

    const expectedVersion = isCustomerFeatureEnabled(this.features, 'optimisticConcurrency')
      ? input.expectedVersion
      : undefined;
    await this.deps.customerRepo.save(customer, expectedVersion);

    await this.deps.publishEvent?.({
      type: 'CustomerUpdated',
      customerId: customer.id,
      occurredAt: now.toISOString(),
    });

    return customer.toPublicSummary();
  }
}

import {
  CustomerEventPublisher,
  IClock,
  ICustomerRepository,
  SystemClock,
} from '../contracts/customer-contracts.js';
import { CustomerPublicSummary } from '../domain/entities/customer.js';
import { CustomerNotFoundError } from '../domain/errors/customer-errors.js';
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  assertCustomerFeatureEnabled,
  resolveCustomerFeatures,
} from '../domain/services/customer-features.js';

import { NonEmptyIdSchema, parseWithCustomerSchema } from '../schemas/customer.schemas.js';

export interface AnonymizeCustomerDeps {
  customerRepo: ICustomerRepository;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  featureProfile?: CustomerFeatureProfile;
}

export class AnonymizeCustomerUseCase {
  private readonly clock: IClock;
  private readonly features: CustomerFeatureFlags;

  constructor(private readonly deps: AnonymizeCustomerDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCustomerFeatures(deps.featureProfile);
  }

  public async execute(customerId: string): Promise<CustomerPublicSummary> {
    assertCustomerFeatureEnabled(this.features, 'gdprAnonymization');
    const cleanId = parseWithCustomerSchema(NonEmptyIdSchema, customerId, 'customerId');
    const customer = await this.deps.customerRepo.findById(cleanId);
    if (!customer) {
      throw new CustomerNotFoundError(cleanId);
    }

    const now = this.clock.now();
    customer.anonymizePii(now);
    await this.deps.customerRepo.save(customer);

    await this.deps.publishEvent?.({
      type: 'CustomerAnonymized',
      customerId: customer.id,
      occurredAt: now.toISOString(),
    });

    return customer.toPublicSummary();
  }
}

import {
  CustomerEventPublisher,
  CustomerSearchFilter,
  DefaultIdGenerator,
  IClock,
  ICustomerRepository,
  IIdGenerator,
  SystemClock,
} from './contracts/customer-contracts.js';
import {
  CustomerFeatureFlags,
  CustomerFeatureProfile,
  resolveCustomerFeatures,
} from './domain/services/customer-features.js';
import { InMemoryCustomerRepository } from './repositories/in-memory/in-memory-customer-repository.js';
import { AnonymizeCustomerUseCase } from './use-cases/anonymize-customer.use-case.js';
import { CreateCustomerInput, CreateCustomerUseCase } from './use-cases/create-customer.use-case.js';
import {
  ChargeCreditInput,
  ConfigureCreditInput,
  ManageCustomerCreditUseCase,
  RecordCreditPaymentInput,
} from './use-cases/manage-customer-credit.use-case.js';
import {
  EarnLoyaltyInput,
  ManageCustomerLoyaltyUseCase,
  RedeemLoyaltyInput,
} from './use-cases/manage-customer-loyalty.use-case.js';
import {
  ManageCustomerWalletUseCase,
  WalletDepositInput,
  WalletSpendInput,
} from './use-cases/manage-customer-wallet.use-case.js';
import { SearchCustomersUseCase } from './use-cases/search-customers.use-case.js';
import { UpdateCustomerInput, UpdateCustomerUseCase } from './use-cases/update-customer.use-case.js';

export interface CustomersModuleDeps {
  customerRepo?: ICustomerRepository;
  publishEvent?: CustomerEventPublisher;
  clock?: IClock;
  idGenerator?: IIdGenerator;
  featureProfile?: CustomerFeatureProfile;
}

export function createCustomersModule(deps: CustomersModuleDeps = {}) {
  const customerRepo = deps.customerRepo ?? new InMemoryCustomerRepository();
  const clock = deps.clock ?? SystemClock;
  const idGenerator = deps.idGenerator ?? DefaultIdGenerator;
  const features: CustomerFeatureFlags = resolveCustomerFeatures(deps.featureProfile);

  const createUseCase = new CreateCustomerUseCase({
    customerRepo,
    publishEvent: deps.publishEvent,
    clock,
    featureProfile: features,
  });
  const updateUseCase = new UpdateCustomerUseCase({
    customerRepo,
    publishEvent: deps.publishEvent,
    clock,
    featureProfile: features,
  });
  const searchUseCase = new SearchCustomersUseCase(customerRepo);
  const anonymizeUseCase = new AnonymizeCustomerUseCase({
    customerRepo,
    publishEvent: deps.publishEvent,
    clock,
    featureProfile: features,
  });
  const creditUseCase = new ManageCustomerCreditUseCase({
    customerRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator,
    featureProfile: features,
  });
  const walletUseCase = new ManageCustomerWalletUseCase({
    customerRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator,
    featureProfile: features,
  });
  const loyaltyUseCase = new ManageCustomerLoyaltyUseCase({
    customerRepo,
    publishEvent: deps.publishEvent,
    clock,
    idGenerator,
    featureProfile: features,
  });

  return {
    features,
    repositories: { customerRepo },
    useCases: {
      createCustomer: createUseCase,
      updateCustomer: updateUseCase,
      searchCustomers: searchUseCase,
      anonymizeCustomer: anonymizeUseCase,
      manageCredit: creditUseCase,
      manageWallet: walletUseCase,
      manageLoyalty: loyaltyUseCase,
    },
    createCustomer: (input: CreateCustomerInput) => createUseCase.execute(input),
    updateCustomer: (input: UpdateCustomerInput) => updateUseCase.execute(input),
    searchCustomers: (filter?: CustomerSearchFilter) => searchUseCase.execute(filter),
    anonymizeCustomer: (customerId: string) => anonymizeUseCase.execute(customerId),
    configureCredit: (input: ConfigureCreditInput) => creditUseCase.configureCredit(input),
    chargeCredit: (input: ChargeCreditInput) => creditUseCase.charge(input),
    recordCreditPayment: (input: RecordCreditPaymentInput) => creditUseCase.recordPayment(input),
    setCreditFrozen: (customerId: string, frozen: boolean) =>
      creditUseCase.setFrozen(customerId, frozen),
    getCreditAgingSummary: (customerId: string) => creditUseCase.getAgingSummary(customerId),
    depositWallet: (input: WalletDepositInput) => walletUseCase.deposit(input),
    spendWallet: (input: WalletSpendInput) => walletUseCase.spend(input),
    earnLoyaltyFromPurchase: (input: EarnLoyaltyInput) => loyaltyUseCase.earnFromPurchase(input),
    redeemLoyaltyPoints: (input: RedeemLoyaltyInput) => loyaltyUseCase.redeem(input),
    expireLoyaltyPoints: (customerId: string) => loyaltyUseCase.expirePoints(customerId),
  };
}

export type CustomersModule = ReturnType<typeof createCustomersModule>;

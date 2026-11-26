import {
  CatalogEventPublisher,
  CatalogSearchFilter,
  ICatalogItemRepository,
  ICategoryRepository,
  IClock,
  IPriceListRepository,
  IPromotionRepository,
  SystemClock,
} from './contracts/catalog-contracts.js';
import {
  CatalogFeatureFlags,
  CatalogFeatureProfile,
  resolveCatalogFeatures,
} from './domain/services/catalog-features.js';
import {
  InMemoryCatalogItemRepository,
  InMemoryCategoryRepository,
  InMemoryPriceListRepository,
  InMemoryPromotionRepository,
} from './repositories/in-memory/in-memory-catalog-repositories.js';
import { LookupCatalogUseCase } from './use-cases/lookup-catalog.use-case.js';
import {
  CreateCatalogItemInput,
  ManageCatalogItemUseCase,
  UpdateCatalogItemInput,
} from './use-cases/manage-catalog-item.use-case.js';
import {
  CreateCategoryInput,
  ManageCategoryUseCase,
  UpdateCategoryInput,
} from './use-cases/manage-category.use-case.js';
import {
  CreatePriceListInput,
  CreatePromotionInput,
  ManagePricingCatalogUseCase,
} from './use-cases/manage-price-list.use-case.js';
import {
  ResolveCatalogPriceRequest,
  ResolveCatalogPriceUseCase,
} from './use-cases/resolve-catalog-price.use-case.js';

export interface CatalogModuleDeps {
  itemRepo?: ICatalogItemRepository;
  categoryRepo?: ICategoryRepository;
  priceListRepo?: IPriceListRepository;
  promotionRepo?: IPromotionRepository;
  publishEvent?: CatalogEventPublisher;
  clock?: IClock;
  featureProfile?: CatalogFeatureProfile;
}

export function createCatalogModule(deps: CatalogModuleDeps = {}) {
  const itemRepo = deps.itemRepo ?? new InMemoryCatalogItemRepository();
  const categoryRepo = deps.categoryRepo ?? new InMemoryCategoryRepository();
  const priceListRepo = deps.priceListRepo ?? new InMemoryPriceListRepository();
  const promotionRepo = deps.promotionRepo ?? new InMemoryPromotionRepository();
  const clock = deps.clock ?? SystemClock;
  const features: CatalogFeatureFlags = resolveCatalogFeatures(deps.featureProfile);

  const manageCategoryUseCase = new ManageCategoryUseCase({
    categoryRepo,
    publishEvent: deps.publishEvent,
    clock,
    featureProfile: features,
  });
  const manageItemUseCase = new ManageCatalogItemUseCase({
    itemRepo,
    publishEvent: deps.publishEvent,
    clock,
    featureProfile: features,
  });
  const lookupUseCase = new LookupCatalogUseCase(itemRepo);
  const managePricingUseCase = new ManagePricingCatalogUseCase({
    priceListRepo,
    promotionRepo,
    publishEvent: deps.publishEvent,
    clock,
    featureProfile: features,
  });
  const resolvePriceUseCase = new ResolveCatalogPriceUseCase({
    itemRepo,
    priceListRepo,
    promotionRepo,
    clock,
    featureProfile: features,
  });

  return {
    features,
    repositories: { itemRepo, categoryRepo, priceListRepo, promotionRepo },
    useCases: {
      manageCategory: manageCategoryUseCase,
      manageItem: manageItemUseCase,
      lookup: lookupUseCase,
      managePricing: managePricingUseCase,
      resolvePrice: resolvePriceUseCase,
    },
    createCategory: (input: CreateCategoryInput) => manageCategoryUseCase.create(input),
    updateCategory: (input: UpdateCategoryInput) => manageCategoryUseCase.update(input),
    createItem: (input: CreateCatalogItemInput) => manageItemUseCase.create(input),
    updateItem: (input: UpdateCatalogItemInput) => manageItemUseCase.update(input),
    upsertVariant: (itemId: string, rawVariant: unknown, expectedVersion?: number) =>
      manageItemUseCase.upsertVariant(itemId, rawVariant, expectedVersion),
    upsertModifierGroup: (itemId: string, rawGroup: unknown, expectedVersion?: number) =>
      manageItemUseCase.upsertModifierGroup(itemId, rawGroup, expectedVersion),
    search: (filter?: CatalogSearchFilter) => lookupUseCase.search(filter),
    lookupByBarcodeOrSku: (code: string) => lookupUseCase.lookupByBarcodeOrSku(code),
    createPriceList: (input: CreatePriceListInput) => managePricingUseCase.createPriceList(input),
    upsertPriceEntry: (priceListId: string, rawEntry: unknown, expectedVersion?: number) =>
      managePricingUseCase.upsertPriceEntry(priceListId, rawEntry, expectedVersion),
    createPromotion: (input: CreatePromotionInput) => managePricingUseCase.createPromotion(input),
    resolvePrice: (request: ResolveCatalogPriceRequest) => resolvePriceUseCase.execute(request),
  };
}

export type CatalogModule = ReturnType<typeof createCatalogModule>;

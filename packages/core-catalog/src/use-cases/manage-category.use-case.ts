import { z } from 'zod';
import {
  CatalogEventPublisher,
  ICategoryRepository,
  IClock,
  SystemClock,
} from '../contracts/catalog-contracts.js';
import { Category, assertNoCategoryCycle } from '../domain/entities/category.js';
import {
  CategoryNotFoundError,
  DuplicateCatalogKeyError,
} from '../domain/errors/catalog-errors.js';
import {
  CatalogFeatureFlags,
  CatalogFeatureProfile,
  assertCatalogFeatureEnabled,
  isCatalogFeatureEnabled,
  resolveCatalogFeatures,
} from '../domain/services/catalog-features.js';
import {
  NonEmptyIdSchema,
  SalesChannelSchema,
  parseWithCatalogSchema,
} from '../schemas/catalog.schemas.js';

const CreateCategoryInputSchema = z.object({
  id: NonEmptyIdSchema,
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  parentId: NonEmptyIdSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  channels: z.array(SalesChannelSchema).optional(),
});

const UpdateCategoryInputSchema = z.object({
  categoryId: NonEmptyIdSchema,
  slug: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  parentId: NonEmptyIdSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  channels: z.array(SalesChannelSchema).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export type CreateCategoryInput = z.input<typeof CreateCategoryInputSchema>;
export type UpdateCategoryInput = z.input<typeof UpdateCategoryInputSchema>;

export interface ManageCategoryDeps {
  categoryRepo: ICategoryRepository;
  publishEvent?: CatalogEventPublisher;
  clock?: IClock;
  featureProfile?: CatalogFeatureProfile;
}

export class ManageCategoryUseCase {
  private readonly clock: IClock;
  private readonly features: CatalogFeatureFlags;

  constructor(private readonly deps: ManageCategoryDeps) {
    this.clock = deps.clock ?? SystemClock;
    this.features = resolveCatalogFeatures(deps.featureProfile);
  }

  public async create(rawInput: CreateCategoryInput): Promise<Category> {
    assertCatalogFeatureEnabled(this.features, 'categories');
    const input = parseWithCatalogSchema(CreateCategoryInputSchema, rawInput, 'create category input');

    if (await this.deps.categoryRepo.findById(input.id)) {
      throw new DuplicateCatalogKeyError('id', input.id);
    }
    if (await this.deps.categoryRepo.findBySlug(input.slug)) {
      throw new DuplicateCatalogKeyError('slug', input.slug);
    }

    if (input.parentId) {
      const parent = await this.deps.categoryRepo.findById(input.parentId);
      if (!parent) throw new CategoryNotFoundError(input.parentId);
      const all = await this.deps.categoryRepo.listAll();
      const map = new Map(all.map((c) => [c.id, c]));
      assertNoCategoryCycle(input.id, input.parentId, map);
    }

    const now = this.clock.now();
    const category = Category.create({ ...input, now });
    await this.deps.categoryRepo.save(category);
    await this.deps.publishEvent?.({
      type: 'CatalogCategorySaved',
      categoryId: category.id,
      occurredAt: now.toISOString(),
    });
    return category;
  }

  public async update(rawInput: UpdateCategoryInput): Promise<Category> {
    assertCatalogFeatureEnabled(this.features, 'categories');
    const input = parseWithCatalogSchema(UpdateCategoryInputSchema, rawInput, 'update category input');

    const category = await this.deps.categoryRepo.findById(input.categoryId);
    if (!category) throw new CategoryNotFoundError(input.categoryId);

    if (input.slug && input.slug.toLowerCase() !== category.slug.toLowerCase()) {
      const dup = await this.deps.categoryRepo.findBySlug(input.slug);
      if (dup && dup.id !== category.id) throw new DuplicateCatalogKeyError('slug', input.slug);
    }

    if (input.parentId !== undefined && input.parentId !== null) {
      const parent = await this.deps.categoryRepo.findById(input.parentId);
      if (!parent) throw new CategoryNotFoundError(input.parentId);
      const all = await this.deps.categoryRepo.listAll();
      const map = new Map(all.map((c) => [c.id, c]));
      assertNoCategoryCycle(category.id, input.parentId, map);
    }

    const now = this.clock.now();
    category.update(input, now);
    await this.deps.categoryRepo.save(
      category,
      isCatalogFeatureEnabled(this.features, 'optimisticConcurrency')
        ? input.expectedVersion
        : undefined
    );
    await this.deps.publishEvent?.({
      type: 'CatalogCategorySaved',
      categoryId: category.id,
      occurredAt: now.toISOString(),
    });
    return category;
  }
}

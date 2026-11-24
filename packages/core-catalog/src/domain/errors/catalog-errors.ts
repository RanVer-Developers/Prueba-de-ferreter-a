export class CatalogDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidCatalogInputError extends CatalogDomainError {
  public readonly issues?: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues?: ReadonlyArray<{ path: string; message: string }>) {
    super(message);
    this.issues = issues;
  }
}

export class CatalogItemNotFoundError extends CatalogDomainError {
  constructor(identifier: string) {
    super(`Catalog item '${identifier}' was not found.`);
  }
}

export class VariantNotFoundError extends CatalogDomainError {
  constructor(itemId: string, variantId: string) {
    super(`Variant '${variantId}' was not found on catalog item '${itemId}'.`);
  }
}

export class CategoryNotFoundError extends CatalogDomainError {
  constructor(categoryId: string) {
    super(`Category '${categoryId}' was not found.`);
  }
}

export class CyclicCategoryError extends CatalogDomainError {
  constructor(categoryId: string, parentId: string) {
    super(`Cyclic category hierarchy detected between '${categoryId}' and '${parentId}'.`);
  }
}

export class DuplicateCatalogKeyError extends CatalogDomainError {
  constructor(field: 'id' | 'sku' | 'barcode' | 'slug' | 'code', value: string) {
    super(`Catalog entity with ${field} '${value}' already exists.`);
  }
}

export class PriceListNotFoundError extends CatalogDomainError {
  constructor(id: string) {
    super(`Price list '${id}' was not found.`);
  }
}

export class PromotionNotFoundError extends CatalogDomainError {
  constructor(id: string) {
    super(`Promotion '${id}' was not found.`);
  }
}

export class InvalidModifierSelectionError extends CatalogDomainError {
  constructor(groupId: string, reason: string) {
    super(`Invalid modifier selection for group '${groupId}': ${reason}`);
  }
}

export class ConcurrencyError extends CatalogDomainError {
  constructor(
    public readonly entity: string,
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict on ${entity} '${entityId}': expected version ${expectedVersion}, actual ${actualVersion}.`
    );
  }
}

export class FeatureDisabledError extends CatalogDomainError {
  constructor(public readonly feature: string, details?: string) {
    super(
      details
        ? `Catalog feature '${feature}' is disabled: ${details}`
        : `Catalog feature '${feature}' is disabled in the active profile.`
    );
  }
}

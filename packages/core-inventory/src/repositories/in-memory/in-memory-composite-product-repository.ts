import { CompositeProduct } from '../../domain/entities/composite-product.js';
import { ICompositeProductRepository } from '../composite-product-repository.interface.js';

export class InMemoryCompositeProductRepository implements ICompositeProductRepository {
  private readonly composites = new Map<string, CompositeProduct>();

  public async save(composite: CompositeProduct): Promise<void> {
    this.composites.set(composite.compositeItemId, CompositeProduct.fromJSON(composite.toJSON()));
  }

  public async findById(compositeItemId: string): Promise<CompositeProduct | null> {
    const comp = this.composites.get(compositeItemId);
    if (!comp) return null;
    return CompositeProduct.fromJSON(comp.toJSON());
  }

  public async listAll(): Promise<CompositeProduct[]> {
    return Array.from(this.composites.values()).map((c) => CompositeProduct.fromJSON(c.toJSON()));
  }
}

import { CompositeProduct } from '../domain/entities/composite-product.js';

export interface ICompositeProductRepository {
  save(composite: CompositeProduct): Promise<void>;
  findById(compositeItemId: string): Promise<CompositeProduct | null>;
  listAll(): Promise<CompositeProduct[]>;
}

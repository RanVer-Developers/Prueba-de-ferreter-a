import { generateId } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemPurchasingClock,
  type IPurchasingClock,
} from '../contracts/purchasing-contracts.js';
import {
  InvalidPurchasingInputError,
  PurchasingCurrencyMismatchError,
  SupplierNotFoundError,
} from '../domain/errors/purchasing-errors.js';
import type { ISupplierProductRepository } from '../repositories/supplier-product-repository.interface.js';
import type { ISupplierRepository } from '../repositories/supplier-repository.interface.js';
import {
  PURCHASING_SCHEMA_VERSION,
  SupplierProductSchema,
  type SupplierProduct,
} from '../schemas/purchasing.schemas.js';

export const LinkSupplierProductInputSchema = z.object({
  supplierId: z.string().min(1),
  productId: z.string().min(1),
  supplierSku: z.string().min(1).optional(),
  purchaseUom: z.string().min(1).default('UNIT'),
  packSize: z.number().positive().default(1),
  lastUnitCostCents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).optional(),
  minOrderQuantity: z.number().positive().default(1),
  leadTimeDays: z.number().int().min(0).default(0),
  isPreferred: z.boolean().default(false),
});
export type LinkSupplierProductInput = z.input<typeof LinkSupplierProductInputSchema>;

export interface LinkSupplierProductDeps {
  supplierRepository: ISupplierRepository;
  supplierProductRepository: ISupplierProductRepository;
  clock?: IPurchasingClock;
}

export async function linkSupplierProduct(
  rawInput: LinkSupplierProductInput,
  deps: LinkSupplierProductDeps,
): Promise<SupplierProduct> {
  const parsed = LinkSupplierProductInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid supplier product input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const data = parsed.data;
  const supplier = await deps.supplierRepository.findById(data.supplierId);
  if (!supplier) {
    throw new SupplierNotFoundError(data.supplierId);
  }

  const currency = (data.currency ?? supplier.currency).toUpperCase();
  if (currency !== supplier.currency) {
    throw new PurchasingCurrencyMismatchError(supplier.currency, currency);
  }

  const existing = await deps.supplierProductRepository.findBySupplierAndProduct(
    data.supplierId,
    data.productId,
  );

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();

  const entity = SupplierProductSchema.parse({
    schemaVersion: PURCHASING_SCHEMA_VERSION,
    id: existing?.id ?? generateId('sp'),
    supplierId: data.supplierId,
    productId: data.productId,
    supplierSku: data.supplierSku ?? existing?.supplierSku,
    purchaseUom: data.purchaseUom,
    packSize: data.packSize,
    lastUnitCostCents: data.lastUnitCostCents,
    currency,
    minOrderQuantity: data.minOrderQuantity,
    leadTimeDays: data.leadTimeDays,
    isPreferred: data.isPreferred,
    updatedAt: now,
  });

  await deps.supplierProductRepository.save(entity);
  return entity;
}

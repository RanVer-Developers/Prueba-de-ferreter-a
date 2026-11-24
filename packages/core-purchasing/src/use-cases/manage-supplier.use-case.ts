import { generateId } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemPurchasingClock,
  type IPurchasingClock,
  type IPurchasingEventBus,
} from '../contracts/purchasing-contracts.js';
import {
  InvalidPurchasingInputError,
  SupplierNotFoundError,
} from '../domain/errors/purchasing-errors.js';
import type { ISupplierRepository } from '../repositories/supplier-repository.interface.js';
import {
  PURCHASING_SCHEMA_VERSION,
  PaymentTermsTypeSchema,
  SupplierSchema,
  SupplierStatusSchema,
  type Supplier,
} from '../schemas/purchasing.schemas.js';

export const CreateSupplierInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    name: z.string().min(1),
    legalName: z.string().min(1).optional(),
    taxId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    currency: z.string().min(3).max(3).default('MXN'),
    paymentTerms: PaymentTermsTypeSchema.default('CASH'),
    creditDays: z.number().int().min(0).default(0),
    creditLimitCents: z.number().int().nonnegative().optional(),
    unlimitedCredit: z.boolean().default(false),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.paymentTerms === 'CREDIT' &&
      !val.unlimitedCredit &&
      (val.creditLimitCents === undefined || val.creditLimitCents <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['creditLimitCents'],
        message: 'CREDIT suppliers must specify creditLimitCents > 0 or set unlimitedCredit: true.',
      });
    }
  });
export type CreateSupplierInput = z.input<typeof CreateSupplierInputSchema>;

export const UpdateSupplierInputSchema = z.object({
  supplierId: z.string().min(1),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  legalName: z.string().min(1).optional(),
  taxId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  paymentTerms: PaymentTermsTypeSchema.optional(),
  creditDays: z.number().int().min(0).optional(),
  creditLimitCents: z.number().int().nonnegative().optional(),
  unlimitedCredit: z.boolean().optional(),
  status: SupplierStatusSchema.optional(),
  notes: z.string().optional(),
});
export type UpdateSupplierInput = z.input<typeof UpdateSupplierInputSchema>;

export interface ManageSupplierDeps {
  supplierRepository: ISupplierRepository;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
}

export async function createSupplier(
  rawInput: CreateSupplierInput,
  deps: ManageSupplierDeps,
): Promise<Supplier> {
  const parsed = CreateSupplierInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid supplier input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const data = parsed.data;
  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const isCash = data.paymentTerms === 'CASH';

  const supplier = SupplierSchema.parse({
    schemaVersion: PURCHASING_SCHEMA_VERSION,
    id: data.id ?? generateId('sup'),
    code: data.code,
    name: data.name.trim(),
    legalName: data.legalName?.trim(),
    taxId: data.taxId?.trim(),
    email: data.email,
    phone: data.phone,
    address: data.address,
    currency: data.currency.toUpperCase(),
    paymentTerms: data.paymentTerms,
    creditDays: isCash ? 0 : data.creditDays,
    creditLimitCents: isCash ? 0 : (data.creditLimitCents ?? 0),
    unlimitedCredit: isCash ? false : data.unlimitedCredit,
    status: 'ACTIVE',
    notes: data.notes,
    createdAt: now,
    updatedAt: now,
  });

  await deps.supplierRepository.save(supplier);
  await deps.eventBus?.publish({
    type: 'SupplierCreated',
    supplierId: supplier.id,
    name: supplier.name,
    occurredAt: now,
  });

  return supplier;
}

export async function updateSupplier(
  rawInput: UpdateSupplierInput,
  deps: ManageSupplierDeps,
): Promise<Supplier> {
  const parsed = UpdateSupplierInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid supplier update input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const data = parsed.data;
  const existing = await deps.supplierRepository.findById(data.supplierId);
  if (!existing) {
    throw new SupplierNotFoundError(data.supplierId);
  }

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const paymentTerms = data.paymentTerms ?? existing.paymentTerms;
  const isCash = paymentTerms === 'CASH';
  const unlimitedCredit = isCash ? false : (data.unlimitedCredit ?? existing.unlimitedCredit);
  const creditLimitCents = isCash ? 0 : (data.creditLimitCents ?? existing.creditLimitCents);

  if (!isCash && !unlimitedCredit && creditLimitCents <= 0) {
    throw new InvalidPurchasingInputError(
      'CREDIT suppliers must specify creditLimitCents > 0 or set unlimitedCredit: true.',
      [{ path: 'creditLimitCents', message: 'Positive creditLimitCents or unlimitedCredit: true is required.' }],
    );
  }

  const updated = SupplierSchema.parse({
    ...existing,
    code: data.code ?? existing.code,
    name: data.name ? data.name.trim() : existing.name,
    legalName: data.legalName ? data.legalName.trim() : existing.legalName,
    taxId: data.taxId ? data.taxId.trim() : existing.taxId,
    email: data.email ?? existing.email,
    phone: data.phone ?? existing.phone,
    address: data.address ?? existing.address,
    paymentTerms,
    creditDays: isCash ? 0 : (data.creditDays ?? existing.creditDays),
    creditLimitCents,
    unlimitedCredit,
    status: data.status ?? existing.status,
    notes: data.notes ?? existing.notes,
    updatedAt: now,
  });

  await deps.supplierRepository.save(updated);
  await deps.eventBus?.publish({
    type: 'SupplierUpdated',
    supplierId: updated.id,
    status: updated.status,
    occurredAt: now,
  });

  return updated;
}

export const UpsertSupplierAddressInputSchema = z.object({
  supplierId: z.string().min(1),
  addressId: z.string().min(1).optional(),
  kind: z.enum(['PRIMARY', 'BILLING', 'WAREHOUSE', 'PICKUP']).default('PRIMARY'),
  label: z.string().trim().min(1).optional(),
  line1: z.string().trim().min(1),
  line2: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1).optional(),
  postalCode: z.string().trim().min(1),
  countryCode: z.string().trim().toUpperCase().length(2).default('MX'),
  isDefault: z.boolean().default(false),
});
export type UpsertSupplierAddressInput = z.input<typeof UpsertSupplierAddressInputSchema>;

export async function upsertSupplierAddress(
  rawInput: UpsertSupplierAddressInput,
  deps: ManageSupplierDeps,
): Promise<Supplier> {
  const parsed = UpsertSupplierAddressInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid supplier address input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  const data = parsed.data;
  const existing = await deps.supplierRepository.findById(data.supplierId);
  if (!existing) throw new SupplierNotFoundError(data.supplierId);

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const addressId = data.addressId ?? generateId('saddr');
  const nextEntry = {
    id: addressId,
    kind: data.kind,
    label: data.label,
    line1: data.line1,
    line2: data.line2,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode,
    countryCode: data.countryCode,
    isDefault: data.isDefault || existing.addresses.length === 0,
  };

  let addresses = existing.addresses.filter((a) => a.id !== addressId);
  if (nextEntry.isDefault) {
    addresses = addresses.map((a) => ({ ...a, isDefault: false }));
  }
  addresses.push(nextEntry);

  const updated = SupplierSchema.parse({
    ...existing,
    addresses,
    updatedAt: now,
  });
  await deps.supplierRepository.save(updated);
  return updated;
}

export async function removeSupplierAddress(
  supplierId: string,
  addressId: string,
  deps: ManageSupplierDeps,
): Promise<Supplier> {
  const existing = await deps.supplierRepository.findById(supplierId);
  if (!existing) throw new SupplierNotFoundError(supplierId);
  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const remaining = existing.addresses.filter((a) => a.id !== addressId);
  if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
    remaining[0] = { ...remaining[0]!, isDefault: true };
  }
  const updated = SupplierSchema.parse({
    ...existing,
    addresses: remaining,
    updatedAt: now,
  });
  await deps.supplierRepository.save(updated);
  return updated;
}

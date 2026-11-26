import { generateId } from '@modulos/core-shared';
import { z } from 'zod';
import {
  SystemPurchasingClock,
  type IPurchasingClock,
  type IPurchasingEventBus,
} from '../contracts/purchasing-contracts.js';
import {
  InvalidPaymentAmountError,
  InvalidPurchasingInputError,
  SupplierPayableNotFoundError,
} from '../domain/errors/purchasing-errors.js';
import {
  assertPurchasingFeatureEnabled,
  resolvePurchasingFeatures,
  type PurchasingFeatureProfile,
} from '../domain/services/purchasing-features.js';
import type { ISupplierPayableRepository } from '../repositories/supplier-payable-repository.interface.js';
import {
  SupplierPayableSchema,
  type SupplierPayable,
} from '../schemas/purchasing.schemas.js';

export const RecordSupplierPaymentInputSchema = z.object({
  payableId: z.string().min(1),
  amountCents: z.number().int().positive(),
  paymentMethod: z.string().min(1),
  reference: z.string().min(1).optional(),
  paidBy: z.string().min(1).optional(),
  paidAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});
export type RecordSupplierPaymentInput = z.input<typeof RecordSupplierPaymentInputSchema>;

export interface RecordSupplierPaymentDeps {
  supplierPayableRepository: ISupplierPayableRepository;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
  featureProfile?: PurchasingFeatureProfile;
}

export async function recordSupplierPayment(
  rawInput: RecordSupplierPaymentInput,
  deps: RecordSupplierPaymentDeps,
): Promise<SupplierPayable> {
  const parsed = RecordSupplierPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid supplier payment input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const features = resolvePurchasingFeatures(deps.featureProfile);
  assertPurchasingFeatureEnabled(features, 'accountsPayable');

  const data = parsed.data;
  const payable = await deps.supplierPayableRepository.findById(data.payableId);
  if (!payable) {
    throw new SupplierPayableNotFoundError(data.payableId);
  }

  if (payable.status === 'PAID' || payable.status === 'CANCELLED') {
    throw new InvalidPaymentAmountError(data.amountCents, payable.balanceCents);
  }
  if (data.amountCents > payable.balanceCents) {
    throw new InvalidPaymentAmountError(data.amountCents, payable.balanceCents);
  }

  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const paidAt = data.paidAt ?? now;
  const newPaidAmount = payable.paidAmountCents + data.amountCents;
  const newBalance = payable.balanceCents - data.amountCents;

  const updated = SupplierPayableSchema.parse({
    ...payable,
    paidAmountCents: newPaidAmount,
    balanceCents: newBalance,
    status: newBalance === 0 ? 'PAID' : 'PARTIAL',
    payments: [
      ...payable.payments,
      {
        id: generateId('spay'),
        amountCents: data.amountCents,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        paidBy: data.paidBy,
        paidAt,
        notes: data.notes,
      },
    ],
    updatedAt: now,
  });

  await deps.supplierPayableRepository.save(updated);
  await deps.eventBus?.publish({
    type: 'SupplierPaymentRecorded',
    payableId: updated.id,
    supplierId: updated.supplierId,
    amountCents: data.amountCents,
    remainingBalanceCents: updated.balanceCents,
    occurredAt: now,
  });

  return updated;
}

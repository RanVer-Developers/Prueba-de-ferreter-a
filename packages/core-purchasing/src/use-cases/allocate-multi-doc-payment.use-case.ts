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
  PurchasingCurrencyMismatchError,
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

export const PayableAllocationLineSchema = z.object({
  payableId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

export const AllocateMultiDocSupplierPaymentInputSchema = z
  .object({
    supplierId: z.string().min(1),
    totalAmountCents: z.number().int().positive(),
    paymentMethod: z.string().min(1),
    reference: z.string().min(1).optional(),
    paidBy: z.string().min(1).optional(),
    paidAt: z.string().datetime().optional(),
    notes: z.string().optional(),
    /** Explicit per-payable amounts. When omitted, FIFO by dueAt is applied across targetPayableIds (or all open payables of the supplier). */
    allocations: z.array(PayableAllocationLineSchema).min(1).optional(),
    targetPayableIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.allocations) {
      const sum = val.allocations.reduce((acc, a) => acc + a.amountCents, 0);
      if (sum !== val.totalAmountCents) {
        ctx.addIssue({
          code: 'custom',
          path: ['allocations'],
          message: `Sum of explicit allocations (${sum}) must equal totalAmountCents (${val.totalAmountCents}).`,
        });
      }
    }
  });
export type AllocateMultiDocSupplierPaymentInput = z.input<
  typeof AllocateMultiDocSupplierPaymentInputSchema
>;

export interface MultiDocPaymentAllocationSummary {
  readonly payableId: string;
  readonly appliedCents: number;
  readonly remainingBalanceCents: number;
}

export interface AllocateMultiDocSupplierPaymentResult {
  readonly batchPaymentId: string;
  readonly updatedPayables: SupplierPayable[];
  readonly allocations: MultiDocPaymentAllocationSummary[];
}

export interface AllocateMultiDocSupplierPaymentDeps {
  supplierPayableRepository: ISupplierPayableRepository;
  eventBus?: IPurchasingEventBus;
  clock?: IPurchasingClock;
  featureProfile?: PurchasingFeatureProfile;
}

export async function allocateMultiDocumentSupplierPayment(
  rawInput: AllocateMultiDocSupplierPaymentInput,
  deps: AllocateMultiDocSupplierPaymentDeps,
): Promise<AllocateMultiDocSupplierPaymentResult> {
  const parsed = AllocateMultiDocSupplierPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new InvalidPurchasingInputError(
      'Invalid multi-document supplier payment input.',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }

  const features = resolvePurchasingFeatures(deps.featureProfile);
  assertPurchasingFeatureEnabled(features, 'accountsPayable');

  const data = parsed.data;
  const now = (deps.clock ?? new SystemPurchasingClock()).now().toISOString();
  const paidAt = data.paidAt ?? now;

  let plan: Array<{ payable: SupplierPayable; amountCents: number }> = [];

  if (data.allocations) {
    const seen = new Set<string>();
    for (const item of data.allocations) {
      if (seen.has(item.payableId)) {
        throw new InvalidPurchasingInputError(`Duplicate payableId '${item.payableId}' in allocations.`);
      }
      seen.add(item.payableId);
      const payable = await deps.supplierPayableRepository.findById(item.payableId);
      if (!payable) throw new SupplierPayableNotFoundError(item.payableId);
      if (payable.supplierId !== data.supplierId) {
        throw new InvalidPurchasingInputError(
          `Payable '${payable.id}' does not belong to supplier '${data.supplierId}'.`,
        );
      }
      if (payable.status === 'PAID' || payable.status === 'CANCELLED') {
        throw new InvalidPaymentAmountError(item.amountCents, payable.balanceCents);
      }
      if (item.amountCents > payable.balanceCents) {
        throw new InvalidPaymentAmountError(item.amountCents, payable.balanceCents);
      }
      plan.push({ payable, amountCents: item.amountCents });
    }
  } else {
    const candidates = data.targetPayableIds
      ? await Promise.all(
          data.targetPayableIds.map(async (id) => {
            const p = await deps.supplierPayableRepository.findById(id);
            if (!p) throw new SupplierPayableNotFoundError(id);
            if (p.supplierId !== data.supplierId) {
              throw new InvalidPurchasingInputError(
                `Payable '${p.id}' does not belong to supplier '${data.supplierId}'.`,
              );
            }
            return p;
          }),
        )
      : await deps.supplierPayableRepository.findAll({ supplierId: data.supplierId });

    const openPayables = candidates
      .filter((p) => (p.status === 'OPEN' || p.status === 'PARTIAL') && p.balanceCents > 0)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

    const totalOpen = openPayables.reduce((acc, p) => acc + p.balanceCents, 0);
    if (data.totalAmountCents > totalOpen) {
      throw new InvalidPaymentAmountError(data.totalAmountCents, totalOpen);
    }

    let remaining = data.totalAmountCents;
    for (const p of openPayables) {
      if (remaining === 0) break;
      const apply = Math.min(remaining, p.balanceCents);
      plan.push({ payable: p, amountCents: apply });
      remaining -= apply;
    }
  }

  if (plan.length === 0) {
    throw new InvalidPurchasingInputError('No open payables found to allocate payment.');
  }

  const baseCurrency = plan[0]!.payable.currency;
  for (const item of plan) {
    if (item.payable.currency !== baseCurrency) {
      throw new PurchasingCurrencyMismatchError(baseCurrency, item.payable.currency);
    }
  }

  const batchPaymentId = generateId('spbatch');
  const updatedPayables: SupplierPayable[] = [];
  const allocations: MultiDocPaymentAllocationSummary[] = [];

  for (const { payable, amountCents } of plan) {
    const newPaidAmount = payable.paidAmountCents + amountCents;
    const newBalance = payable.balanceCents - amountCents;
    const updated = SupplierPayableSchema.parse({
      ...payable,
      paidAmountCents: newPaidAmount,
      balanceCents: newBalance,
      status: newBalance === 0 ? 'PAID' : 'PARTIAL',
      payments: [
        ...payable.payments,
        {
          id: generateId('spay'),
          amountCents,
          paymentMethod: data.paymentMethod,
          reference: data.reference ?? batchPaymentId,
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
      amountCents,
      remainingBalanceCents: updated.balanceCents,
      occurredAt: now,
    });

    updatedPayables.push(updated);
    allocations.push({
      payableId: updated.id,
      appliedCents: amountCents,
      remainingBalanceCents: updated.balanceCents,
    });
  }

  return { batchPaymentId, updatedPayables, allocations };
}

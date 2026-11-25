import { describe, expect, it } from 'vitest';
import {
  InMemoryServiceOrderRepository,
  InvalidServiceOrderStateError,
  approveServiceOrder,
  consumeServicePart,
  createServiceOrder,
  recordServiceDiagnosisAndQuote,
  recordServiceLabor,
  transitionServiceOrderStatus,
  type IServiceBillingPort,
  type IServiceInventoryPort,
  type IServicesClock,
} from '../src/index.js';

function createClock(iso = '2026-04-01T10:00:00.000Z'): IServicesClock {
  return { now: () => new Date(iso) };
}

describe('@modulos/core-services', () => {
  it('runs a full workshop repair workflow with exact cent math, inventory consumption, warranty, and billing hook', async () => {
    const repo = new InMemoryServiceOrderRepository();
    const consumed: string[] = [];
    const billed: number[] = [];

    const inventoryPort: IServiceInventoryPort = {
      async consumePartStock(input) {
        consumed.push(`${input.productId}:${input.quantity}`);
      },
    };
    const billingPort: IServiceBillingPort = {
      async notifyServiceReadyForBilling(input) {
        billed.push(input.totalCents);
      },
    };

    const clock = createClock();
    const deps = {
      serviceOrderRepository: repo,
      inventoryPort,
      billingPort,
      clock,
      featureProfile: 'ADVANCED' as const,
    };

    const order = await createServiceOrder(
      {
        id: 'srv-1',
        orderNumber: 'OS-1001',
        type: 'REPAIR',
        customerId: 'cust-1',
        assignedTechnicianId: 'tech-1',
        warrantyDays: 90,
        asset: {
          description: 'Rotomartillo Industrial',
          brand: 'Makita',
          model: 'HR2475',
          serialNumber: 'SN-8899',
        },
        reportedIssue: 'No percute y saca chispas en escobillas',
        idempotencyKey: 'create-srv-1',
      },
      deps,
    );

    // Idempotent replay on creation
    const replay = await createServiceOrder(
      {
        id: 'srv-1-other',
        type: 'REPAIR',
        customerId: 'cust-1',
        asset: { description: 'X' },
        reportedIssue: 'Y',
        idempotencyKey: 'create-srv-1',
      },
      deps,
    );
    expect(replay.id).toBe(order.id);

    // Diagnosis & quote before work when requireDiagnosisApproval=true
    await expect(
      recordServiceLabor(
        { serviceOrderId: order.id, description: 'Mano de obra', hours: 1, hourlyRateCents: 50_000 },
        deps,
      ),
    ).rejects.toThrow(InvalidServiceOrderStateError);

    await recordServiceDiagnosisAndQuote(
      {
        serviceOrderId: order.id,
        diagnosisNotes: 'Cambio de carbones y engrane',
        estimatedTotalCents: 98_600,
        technicianId: 'tech-1',
      },
      deps,
    );

    await approveServiceOrder({ serviceOrderId: order.id, approvedBy: 'cust-1' }, deps);

    // 1.5 hours * $400.00 = $600.00 + 16% IVA ($96.00) = $696.00 (69_600 cents)
    await recordServiceLabor(
      {
        serviceOrderId: order.id,
        description: 'Desarmado y ajuste',
        hours: 1.5,
        hourlyRateCents: 40_000,
        taxRateBps: 1600,
        idempotencyKey: 'labor-1',
      },
      deps,
    );

    // 2 units * $125.00 = $250.00 + 16% IVA ($40.00) = $290.00 (29_000 cents)
    const afterParts = await consumeServicePart(
      {
        serviceOrderId: order.id,
        productId: 'prod-carbones',
        description: 'Juego de carbones',
        warehouseId: 'wh-taller',
        quantity: 2,
        unitPriceCents: 12_500,
        unitCostCents: 7_000,
        taxRateBps: 1600,
        idempotencyKey: 'part-1',
      },
      deps,
    );

    expect(consumed).toEqual(['prod-carbones:2']);
    expect(afterParts.laborSubtotalCents).toBe(60_000);
    expect(afterParts.partsSubtotalCents).toBe(25_000);
    expect(afterParts.taxTotalCents).toBe(13_600);
    expect(afterParts.totalCents).toBe(98_600);

    // ADVANCED profile enforces QUALITY_CHECK gate
    await expect(
      transitionServiceOrderStatus(
        { serviceOrderId: order.id, targetStatus: 'READY_FOR_PICKUP' },
        deps,
      ),
    ).rejects.toThrow(InvalidServiceOrderStateError);

    await transitionServiceOrderStatus({ serviceOrderId: order.id, targetStatus: 'QUALITY_CHECK' }, deps);
    await transitionServiceOrderStatus({ serviceOrderId: order.id, targetStatus: 'READY_FOR_PICKUP' }, deps);
    const delivered = await transitionServiceOrderStatus(
      { serviceOrderId: order.id, targetStatus: 'DELIVERED', changedBy: 'desk-1' },
      deps,
    );

    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.warrantyExpiresAt).toBe('2026-06-30T10:00:00.000Z');
    expect(billed).toEqual([98_600]);
  });

  it('zeros out customer charges when service order is under warranty', async () => {
    const repo = new InMemoryServiceOrderRepository();
    const deps = {
      serviceOrderRepository: repo,
      clock: createClock(),
      featureProfile: 'BASIC' as const,
    };

    const order = await createServiceOrder(
      {
        id: 'srv-w1',
        type: 'WARRANTY',
        customerId: 'cust-2',
        isUnderWarranty: true,
        asset: { description: 'Soldadora Inverter' },
        reportedIssue: 'Falla de tarjeta en garantía',
      },
      deps,
    );

    const updated = await consumeServicePart(
      {
        serviceOrderId: order.id,
        productId: 'prod-pcb',
        description: 'Tarjeta PCB',
        warehouseId: 'wh-1',
        quantity: 1,
        unitPriceCents: 150_000,
        unitCostCents: 90_000,
        taxRateBps: 1600,
      },
      deps,
    );

    expect(updated.partLines).toHaveLength(1);
    expect(updated.totalCents).toBe(0);
  });
});

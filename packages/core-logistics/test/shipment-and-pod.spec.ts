import { describe, expect, it } from 'vitest';
import {
  CompleteDeliveryUseCase,
  ConcurrencyError,
  CreateShipmentUseCase,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  InMemoryShipmentRepository,
  InvalidDeliveryPinError,
  MaxDeliveryAttemptsExceededError,
  ProofOfDeliveryRequiredError,
  RecordDeliveryAttemptUseCase,
  Shipment,
  TransitionShipmentStatusUseCase,
} from '../src/index.js';

const origin = {
  recipientName: 'Almacén Central',
  street: 'Av. Reforma 100',
  city: 'CDMX',
  country: 'MX',
};

const destination = {
  recipientName: 'Carlos Ruiz',
  street: 'Calle Juárez 45',
  city: 'CDMX',
  country: 'MX',
  zoneCode: 'CENTRO',
};

const pkg = {
  id: 'pkg-1',
  weightGrams: 1500,
  quantity: 1,
  fragile: false,
};

describe('Shipment, Idempotency, Concurrency & Proof of Delivery', () => {
  it('creates shipment idempotently and preserves schemaVersion on JSON roundtrip', async () => {
    const repo = new InMemoryShipmentRepository();
    const createUseCase = new CreateShipmentUseCase(repo);

    const first = await createUseCase.execute({
      idempotencyKey: 'idem-001',
      orderId: 'ord-1',
      origin,
      destination,
      packages: [pkg],
      shippingFee: { cents: 5000, currency: 'MXN' },
      deliveryPin: '4829',
    });

    const second = await createUseCase.execute({
      idempotencyKey: 'idem-001',
      orderId: 'ord-1',
      origin,
      destination,
      packages: [pkg],
      shippingFee: { cents: 5000, currency: 'MXN' },
    });

    expect(second.id).toBe(first.id);
    const json = first.toJSON();
    expect(json.schemaVersion).toBe(1);

    const rehydrated = Shipment.fromJSON(json);
    expect(rehydrated.id).toBe(first.id);
    expect(rehydrated.shippingFee.toCents()).toBe(5000);
  });

  it('enforces optimistic concurrency on stale shipment saves', async () => {
    const repo = new InMemoryShipmentRepository();
    const createUseCase = new CreateShipmentUseCase(repo);
    const created = await createUseCase.execute({
      origin,
      destination,
      packages: [pkg],
      shippingFee: { cents: 4000, currency: 'MXN' },
    });

    const copyA = await repo.findById(created.id);
    const copyB = await repo.findById(created.id);
    expect(copyA).not.toBeNull();
    expect(copyB).not.toBeNull();

    copyA!.assignDriver('drv-1');
    await repo.save(copyA!);

    copyB!.assignDriver('drv-2');
    await expect(repo.save(copyB!)).rejects.toThrow(ConcurrencyError);
  });

  it('enforces POD signature/photo and PIN verification when enabled', async () => {
    const repo = new InMemoryShipmentRepository();
    const flags = {
      ...DEFAULT_LOGISTICS_FEATURE_FLAGS,
      requireProofOfDelivery: true,
      requireDeliveryPin: true,
    };

    const createUseCase = new CreateShipmentUseCase(repo);
    const transitionUseCase = new TransitionShipmentStatusUseCase(repo, flags);
    const completeUseCase = new CompleteDeliveryUseCase(repo, flags);

    const shipment = await createUseCase.execute({
      origin,
      destination,
      packages: [pkg],
      shippingFee: { cents: 3000, currency: 'MXN' },
      deliveryPin: '9911',
    });

    shipment.assignDriver('drv-1', {}, flags);
    await repo.save(shipment);

    await transitionUseCase.execute({ shipmentId: shipment.id, targetStatus: 'PICKED_UP' });
    await transitionUseCase.execute({ shipmentId: shipment.id, targetStatus: 'IN_TRANSIT' });

    await expect(
      completeUseCase.execute({
        shipmentId: shipment.id,
        receivedBy: 'Carlos Ruiz',
        pin: '9911',
      })
    ).rejects.toThrow(ProofOfDeliveryRequiredError);

    await expect(
      completeUseCase.execute({
        shipmentId: shipment.id,
        receivedBy: 'Carlos Ruiz',
        signatureRef: 'sig://abc',
        pin: '0000',
      })
    ).rejects.toThrow(InvalidDeliveryPinError);

    const delivered = await completeUseCase.execute({
      shipmentId: shipment.id,
      receivedBy: 'Carlos Ruiz',
      signatureRef: 'sig://abc',
      pin: '9911',
    });

    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.proofOfDelivery?.pinVerified).toBe(true);
    expect(delivered.proofOfDelivery?.signatureRef).toBe('sig://abc');
  });

  it('tracks failed delivery attempts and enforces maxDeliveryAttempts', async () => {
    const repo = new InMemoryShipmentRepository();
    const flags = { ...DEFAULT_LOGISTICS_FEATURE_FLAGS, maxDeliveryAttempts: 2 };
    const createUseCase = new CreateShipmentUseCase(repo);
    const attemptUseCase = new RecordDeliveryAttemptUseCase(repo, flags);

    const shipment = await createUseCase.execute({
      origin,
      destination,
      packages: [pkg],
      shippingFee: { cents: 3000, currency: 'MXN' },
    });
    shipment.assignDriver('drv-1', {}, flags);
    shipment.transitionStatus('PICKED_UP', {}, flags);
    shipment.transitionStatus('IN_TRANSIT', {}, flags);
    await repo.save(shipment);

    const afterFirst = await attemptUseCase.execute({
      shipmentId: shipment.id,
      reason: 'RECIPIENT_ABSENT',
      note: 'No one answered',
    });
    expect(afterFirst.status).toBe('FAILED');
    expect(afterFirst.deliveryAttempts).toHaveLength(1);

    const afterSecond = await attemptUseCase.execute({
      shipmentId: shipment.id,
      reason: 'RECIPIENT_ABSENT',
    });
    expect(afterSecond.deliveryAttempts).toHaveLength(2);

    await expect(
      attemptUseCase.execute({
        shipmentId: shipment.id,
        reason: 'RECIPIENT_ABSENT',
      })
    ).rejects.toThrow(MaxDeliveryAttemptsExceededError);
  });
});

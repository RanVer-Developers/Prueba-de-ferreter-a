import { beforeEach, describe, expect, it } from 'vitest';
import {
  CashRegister,
  DuplicateTransactionError,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  MovementType,
  OpenShiftUseCase,
  PaymentMethod,
  RecordMovementUseCase,
  RecordPaymentUseCase,
} from '../src/index.js';

describe('Soporte Offline & Idempotencia', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  const cashier = { id: 'usr-1', name: 'Laura Gómez' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();

    const register = new CashRegister({
      id: 'reg-offline-1',
      name: 'Terminal Offline 1',
      currency: 'USD',
    });
    await registerRepo.save(register);
  });

  it('debe rechazar transacciones duplicadas con la misma clave de idempotencia', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const movementUseCase = new RecordMovementUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-idemp-1',
      cashRegisterId: 'reg-offline-1',
      cashier,
      initialAmount: 100,
    });

    const key = 'sync-uuid-client-12345';

    // Primer intento (exitoso)
    const mov1 = await movementUseCase.execute({
      movementId: 'mov-1',
      shiftId: 'shift-idemp-1',
      type: MovementType.MANUAL_DEPOSIT,
      amount: 50,
      concept: 'Depósito offline',
      idempotencyKey: key,
      performedBy: cashier,
    });

    // Reintento idéntico por reenvío de red: debe retornar el original sin duplicar saldo ni movimientos
    const mov2 = await movementUseCase.execute({
      movementId: 'mov-1-retry',
      shiftId: 'shift-idemp-1',
      type: MovementType.MANUAL_DEPOSIT,
      amount: 50,
      concept: 'Depósito offline duplicado',
      idempotencyKey: key,
      performedBy: cashier,
    });

    expect(mov2.id).toBe(mov1.id);

    const shift = await shiftRepo.findById('shift-idemp-1');
    expect(shift?.calculateExpectedCash().toDecimal()).toBe(150); // 100 inicial + 50 (no 200)
    expect(shift?.movements.length).toBe(1);

    // A nivel de agregación pura en memoria, un intento de insertar directamente la misma clave lanza DuplicateTransactionError
    expect(() => {
      shift?.recordMovement(mov2);
    }).toThrow(DuplicateTransactionError);
  });

  it('debe asignar secuencias monótonas consecutivas a las transacciones', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-seq-1',
      cashRegisterId: 'reg-offline-1',
      cashier,
      initialAmount: 100,
    });

    const res1 = await paymentUseCase.execute({
      shiftId: 'shift-seq-1',
      transactionReference: 'TK-1',
      ticketTotal: 10,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      performedBy: cashier,
    });

    const res2 = await paymentUseCase.execute({
      shiftId: 'shift-seq-1',
      transactionReference: 'TK-2',
      ticketTotal: 20,
      payments: [{ id: 'p2', method: PaymentMethod.CASH }],
      performedBy: cashier,
    });

    expect(res1.movements[0].sequenceNumber).toBe(1);
    expect(res2.movements[0].sequenceNumber).toBe(2);
  });
});

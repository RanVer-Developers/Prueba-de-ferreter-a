import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditCountUseCase,
  CashierLockedError,
  CashLimitExceededEvent,
  CashRegister,
  CloseShiftUseCase,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  MovementType,
  OpenShiftUseCase,
  PaymentMethod,
  RecordMovementUseCase,
  RecordPaymentUseCase,
  ResumeShiftUseCase,
  ShiftLockedEvent,
  ShiftStatus,
  ShiftSuspendedEvent,
  SuspendShiftUseCase,
} from '../src/index.js';

describe('Ciclo de Vida Extendido, Blind Count y Límites de Efectivo', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  let eventsEmitted: any[];

  const eventPublisher = (event: any) => {
    eventsEmitted.push(event);
  };

  const cashier = { id: 'usr-1', name: 'Laura Gómez' };
  const supervisor = { id: 'sup-99', name: 'Marcos Supervisor' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();
    eventsEmitted = [];

    const register = new CashRegister({
      id: 'reg-01',
      name: 'Caja Principal',
      currency: 'USD',
    });
    await registerRepo.save(register);
  });

  it('debe disparar CashLimitExceededEvent cuando el efectivo supera maxCashThreshold', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo, eventPublisher);

    // Abrir turno con límite de seguridad de $500
    await openUseCase.execute({
      shiftId: 'shift-thresh-1',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 400,
      maxCashThreshold: 500,
    });

    // Venta en efectivo de $150 (Gaveta pasa a $550 > $500)
    await paymentUseCase.execute({
      shiftId: 'shift-thresh-1',
      transactionReference: 'TK-ALERT',
      ticketTotal: 150,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      performedBy: cashier,
    });

    const alertEvent = eventsEmitted.find((e) => e instanceof CashLimitExceededEvent);
    expect(alertEvent).toBeDefined();
    expect(alertEvent.currentCashBalance.toDecimal()).toBe(550);
    expect(alertEvent.maxCashThreshold.toDecimal()).toBe(500);
    expect(alertEvent.recommendedSafeDropAmount.toDecimal()).toBe(50);
  });

  it('debe suspender y reanudar el turno registrando auditoría y bloqueando operaciones intermedias', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const suspendUseCase = new SuspendShiftUseCase(shiftRepo, eventPublisher);
    const resumeUseCase = new ResumeShiftUseCase(shiftRepo, eventPublisher);
    const movementUseCase = new RecordMovementUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-susp-1',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 100,
    });

    // Cajero sale a colación/almuerzo
    await suspendUseCase.execute({
      shiftId: 'shift-susp-1',
      reason: 'Salida a almuerzo (45 mins)',
      authorizedBy: supervisor,
    });

    const shiftSuspended = await shiftRepo.findById('shift-susp-1');
    expect(shiftSuspended?.status).toBe(ShiftStatus.SUSPENDED);
    expect(shiftSuspended?.isSuspended()).toBe(true);

    const suspEvent = eventsEmitted.find((e) => e instanceof ShiftSuspendedEvent);
    expect(suspEvent).toBeDefined();
    expect(suspEvent.reason).toBe('Salida a almuerzo (45 mins)');

    // No debe permitir operaciones mientras está suspendido
    await expect(
      movementUseCase.execute({
        movementId: 'm-fail',
        shiftId: 'shift-susp-1',
        type: MovementType.MANUAL_DEPOSIT,
        amount: 20,
        concept: 'Intento durante pausa',
        performedBy: cashier,
      })
    ).rejects.toThrow(CashierLockedError);

    // Reanudar turno
    await resumeUseCase.execute({
      shiftId: 'shift-susp-1',
      authorizedBy: supervisor,
    });

    const shiftResumed = await shiftRepo.findById('shift-susp-1');
    expect(shiftResumed?.status).toBe(ShiftStatus.OPEN);
    expect(shiftResumed?.isOpen()).toBe(true);
  });

  it('debe bloquear y desbloquear la terminal por seguridad', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
    const suspendUseCase = new SuspendShiftUseCase(shiftRepo, eventPublisher);
    const resumeUseCase = new ResumeShiftUseCase(shiftRepo, eventPublisher);

    await openUseCase.execute({
      shiftId: 'shift-lock-1',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 100,
    });

    await suspendUseCase.execute({
      shiftId: 'shift-lock-1',
      reason: 'Bloqueo automático por inactividad',
      mode: 'LOCK',
    });

    const shiftLocked = await shiftRepo.findById('shift-lock-1');
    expect(shiftLocked?.isLocked()).toBe(true);

    const lockEvent = eventsEmitted.find((e) => e instanceof ShiftLockedEvent);
    expect(lockEvent).toBeDefined();

    // Desbloquear
    await resumeUseCase.execute({
      shiftId: 'shift-lock-1',
      authorizedBy: supervisor,
    });

    const shiftUnlocked = await shiftRepo.findById('shift-lock-1');
    expect(shiftUnlocked?.isOpen()).toBe(true);
  });

  it('debe registrar Arqueo Ciego (Blind Count) y sellar con firma de supervisor', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);
    const closeUseCase = new CloseShiftUseCase(registerRepo, shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-blind-1',
      cashRegisterId: 'reg-01',
      cashier,
      initialAmount: 200,
    });

    await paymentUseCase.execute({
      shiftId: 'shift-blind-1',
      transactionReference: 'TK-100',
      ticketTotal: 80,
      payments: [{ id: 'p1', method: PaymentMethod.CASH }],
      performedBy: cashier,
    });

    // Al cerrar con arqueo ciego, el cajero solo declara lo que contó físicamente (ej: $280)
    // El sistema sella la reconciliación con la firma y supervisor
    const closed = await closeUseCase.execute({
      shiftId: 'shift-blind-1',
      declaredCashAmount: 280,
      isBlindCount: true,
      supervisorId: 'sup-99',
      signatureToken: 'HMAC_SHA256_SUPERVISOR_SIG_TOKEN',
      closingNotes: 'Conteo ciego realizado conforme',
    });

    expect(closed.reconciliation?.isBlindCount).toBe(true);
    expect(closed.reconciliation?.supervisorId).toBe('sup-99');
    expect(closed.reconciliation?.signatureToken).toBe('HMAC_SHA256_SUPERVISOR_SIG_TOKEN');
    expect(closed.reconciliation?.cashStatus).toBe('EXACT');
  });
});

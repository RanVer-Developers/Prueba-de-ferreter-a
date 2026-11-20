import { beforeEach, describe, expect, it } from 'vitest';
import {
  CashBreakdown,
  CashMovement,
  CashRegister,
  CashShift,
  CloseShiftUseCase,
  DrawerOpenedWithoutSaleEvent,
  ESC_POS_COMMANDS,
  ESC_POS_COMMANDS_BYTES,
  EscPosTicketFormatter,
  GenerateAuditReportUseCase,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  MovementType,
  OpenDrawerNoSaleUseCase,
  OpenShiftUseCase,
  PaymentMethod,
  RecordMovementUseCase,
  RecordPaymentUseCase,
  SafeDropPerformedEvent,
  SelfApprovalNotAllowedError,
  SupervisorApprovalRequiredError,
} from '../src/index.js';

describe('Mejoras de Dominio Puro (Propuestas A, B y C)', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  let emittedEvents: any[];

  const eventPublisher = (event: any) => {
    emittedEvents.push(event);
  };

  const cashier = { id: 'cashier-1', name: 'Ana Cajera', role: 'CASHIER' };
  const supervisor = { id: 'sup-1', name: 'Carlos Supervisor', role: 'SUPERVISOR' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();
    emittedEvents = [];

    const register = new CashRegister({
      id: 'reg-01',
      name: 'Caja Principal 01',
      currency: 'USD',
    });
    await registerRepo.save(register);
  });

  describe('Propuesta A: Herencia del desglose físico de billetes entre turnos (carryOverBreakdown)', () => {
    it('debe retener el desglose físico al cerrar un turno y heredarlo en la apertura del siguiente turno', async () => {
      const openShift = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
      const paymentUseCase = new RecordPaymentUseCase(shiftRepo, eventPublisher);
      const closeShift = new CloseShiftUseCase(registerRepo, shiftRepo, eventPublisher);

      // 1. Abrir Turno 1 con $100 (5 billetes de $20)
      await openShift.execute({
        shiftId: 'shift-1',
        cashRegisterId: 'reg-01',
        cashier,
        initialAmount: 100,
        cashBreakdownCounts: { 20: 5 },
      });

      // 2. Cobrar una venta de $50 en efectivo (recibe 5 billetes de $10)
      await paymentUseCase.execute({
        shiftId: 'shift-1',
        transactionReference: 'SALE-01',
        ticketTotal: 50,
        payments: [{ method: PaymentMethod.CASH, amount: 50 }],
        tenderedCash: 50,
        tenderedBreakdownCounts: { 10: 5 },
        performedBy: cashier,
      });

      // Total en gaveta: $150 ($20 x 5 + $10 x 5)
      // 3. Cerrar Turno 1 reteniendo $70 como fondo para el turno siguiente ($20 x 2 + $10 x 3 = $70)
      await closeShift.execute({
        shiftId: 'shift-1',
        declaredCashAmount: 150,
        retainedFloatAmount: 70,
        retainedBreakdownCounts: { 20: 2, 10: 3 },
      });

      const updatedRegister = await registerRepo.findById('reg-01');
      expect(updatedRegister?.isOpen()).toBe(false);
      expect(updatedRegister?.carryOverFloat?.toDecimal()).toBe(70);
      expect(updatedRegister?.carryOverBreakdown).toBeDefined();
      expect(updatedRegister?.carryOverBreakdown?.calculateTotal().toDecimal()).toBe(70);
      expect(updatedRegister?.carryOverBreakdown?.getCount(20)).toBe(2);
      expect(updatedRegister?.carryOverBreakdown?.getCount(10)).toBe(3);

      // Rehidratación JSON de CashRegister con carryOverBreakdown
      const restoredRegister = CashRegister.fromJSON(updatedRegister!.toJSON());
      expect(restoredRegister.carryOverBreakdown?.calculateTotal().toDecimal()).toBe(70);
      expect(restoredRegister.carryOverBreakdown?.getCount(20)).toBe(2);

      // 4. Abrir Turno 2 en la misma caja sin declarar desglose ni monto: debe heredar $70 y el desglose físico
      const shift2 = await openShift.execute({
        shiftId: 'shift-2',
        cashRegisterId: 'reg-01',
        cashier,
      });

      expect(shift2.initialBalance.toDecimal()).toBe(70);
      expect(shift2.drawerBreakdown.calculateTotal().toDecimal()).toBe(70);
      expect(shift2.drawerBreakdown.getCount(20)).toBe(2);
      expect(shift2.drawerBreakdown.getCount(10)).toBe(3);

      // El fondo retenido se limpió de la caja al ser consumido por el nuevo turno
      const regAfterOpen = await registerRepo.findById('reg-01');
      expect(regAfterOpen?.carryOverFloat).toBeUndefined();
      expect(regAfterOpen?.carryOverBreakdown).toBeUndefined();

      // 5. Verificar que Shift 2 puede dar vuelto óptimo inmediatamente usando el inventario físico heredado
      const changeResult = shift2.calculateOptimalChange(30);
      expect(changeResult.possible).toBe(true);
      expect(changeResult.remainingToDispense.isZero()).toBe(true);
      // 30 se compone de 1x20 + 1x10
      expect(changeResult.changeBreakdown.getCount(20)).toBe(1);
      expect(changeResult.changeBreakdown.getCount(10)).toBe(1);
    });

    it('debe deducir automáticamente el desglose si el total contado coincide exactamente con el fondo retenido', async () => {
      const openShift = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
      const closeShift = new CloseShiftUseCase(registerRepo, shiftRepo, eventPublisher);

      await openShift.execute({
        shiftId: 'shift-a',
        cashRegisterId: 'reg-01',
        cashier,
        initialAmount: 50,
        cashBreakdownCounts: { 10: 5 },
      });

      // Al cerrar, el cajero contó { 10: 5 } ($50) y se retiene el 100% como fondo
      await closeShift.execute({
        shiftId: 'shift-a',
        cashBreakdownCounts: { 10: 5 },
        retainedFloatAmount: 50,
      });

      const reg = await registerRepo.findById('reg-01');
      expect(reg?.carryOverFloat?.toDecimal()).toBe(50);
      expect(reg?.carryOverBreakdown?.getCount(10)).toBe(5);
    });
  });

  describe('Propuesta B: Apertura de cajón sin venta (NoSaleDrawerOpen / Kick Drawer)', () => {
    it('debe registrar la apertura de cajón con motivo y comando ESC/POS', async () => {
      const openShift = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
      const openDrawerUseCase = new OpenDrawerNoSaleUseCase(shiftRepo, eventPublisher);

      await openShift.execute({
        shiftId: 'shift-drawer-1',
        cashRegisterId: 'reg-01',
        cashier,
        initialAmount: 100,
      });

      const result = await openDrawerUseCase.execute({
        shiftId: 'shift-drawer-1',
        reason: 'Cambio de billete de $100 por billetes menores para cliente',
        performedBy: cashier,
      });

      expect(result.shiftId).toBe('shift-drawer-1');
      expect(result.reason).toContain('Cambio de billete');
      expect(result.performedBy.id).toBe(cashier.id);
      expect(result.escPosCommand).toBe(ESC_POS_COMMANDS.OPEN_DRAWER);
      expect(result.escPosBytes).toEqual(ESC_POS_COMMANDS_BYTES.OPEN_DRAWER);
      expect(result.openedAt).toBeInstanceOf(Date);

      // Evento de dominio emitido
      const event = emittedEvents.find((e) => e instanceof DrawerOpenedWithoutSaleEvent) as DrawerOpenedWithoutSaleEvent;
      expect(event).toBeDefined();
      expect(event.reason).toContain('Cambio de billete');
      expect(event.performedBy.name).toBe(cashier.name);

      // Historial en el agregado CashShift
      const shift = (await shiftRepo.findById('shift-drawer-1'))!;
      expect(shift.drawerOpenHistory).toHaveLength(1);
      expect(shift.drawerOpenHistory[0].reason).toContain('Cambio de billete');

      // Trazabilidad en reporte X
      const reportUseCase = new GenerateAuditReportUseCase(shiftRepo, registerRepo);
      const reportX = await reportUseCase.execute('shift-drawer-1', 'X');
      expect(reportX.drawerOpeningsCount).toBe(1);

      // Rehidratación lossless desde JSON / Snapshot
      const shiftJson = shift.toJSON();
      expect(shiftJson.drawerOpeningsCount).toBe(1);
      expect(shiftJson.drawerOpenHistory[0].reason).toContain('Cambio de billete');

      const rehydrated = CashShift.fromJSON(shiftJson);
      expect(rehydrated.drawerOpenHistory).toHaveLength(1);
      expect(rehydrated.drawerOpenHistory[0].reason).toContain('Cambio de billete');
    });

    it('debe exigir supervisor cuando requireSupervisor sea true y rechazar auto-aprobación del cajero', async () => {
      const openShift = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
      const openDrawerUseCase = new OpenDrawerNoSaleUseCase(shiftRepo, eventPublisher);

      await openShift.execute({
        shiftId: 'shift-drawer-2',
        cashRegisterId: 'reg-01',
        cashier,
        initialAmount: 100,
      });

      // 1. Sin supervisor cuando se requiere -> Error
      await expect(
        openDrawerUseCase.execute({
          shiftId: 'shift-drawer-2',
          reason: 'Inspección de auditoría de gaveta',
          performedBy: cashier,
          requireSupervisor: true,
        })
      ).rejects.toThrow(SupervisorApprovalRequiredError);

      // 2. Auto-aprobación (cajero intenta autorizarse a sí mismo) -> Error
      await expect(
        openDrawerUseCase.execute({
          shiftId: 'shift-drawer-2',
          reason: 'Inspección',
          performedBy: cashier,
          authorizedBy: cashier,
          requireSupervisor: true,
        })
      ).rejects.toThrow(SelfApprovalNotAllowedError);

      // 3. Con supervisor válido con rol 'SUPERVISOR' -> Éxito
      const result = await openDrawerUseCase.execute({
        shiftId: 'shift-drawer-2',
        reason: 'Inspección de auditoría de gaveta',
        performedBy: cashier,
        authorizedBy: supervisor,
        requireSupervisor: true,
      });

      expect(result.authorizedBy?.id).toBe(supervisor.id);
      expect(result.escPosCommand).toBe(ESC_POS_COMMANDS.OPEN_DRAWER);
    });
  });

  describe('Propuesta C: Remesas parciales con sobre y precinto (SafeDropDetails y recibos)', () => {
    it('debe registrar SafeDrop con número de sobre, precinto, testigo y bóveda de destino', async () => {
      const openShift = new OpenShiftUseCase(registerRepo, shiftRepo, eventPublisher);
      const movementUseCase = new RecordMovementUseCase(shiftRepo, eventPublisher);

      await openShift.execute({
        shiftId: 'shift-safedrop-1',
        cashRegisterId: 'reg-01',
        cashier,
        initialAmount: 500,
      });

      const movement = await movementUseCase.execute({
        movementId: 'drop-001',
        shiftId: 'shift-safedrop-1',
        type: MovementType.SAFE_DROP,
        amount: 300,
        concept: 'Remesa de seguridad vespertina a bóveda',
        performedBy: cashier,
        safeDropEnvelopeNumber: 'SOBRE-2026-089',
        safeDropSealNumber: 'PREC-774411',
        safeDropWitness: { id: 'guard-1', name: 'Javier Guardia' },
        safeDropDestinationVault: 'BÓVEDA DEPARTAMENTO TESORERÍA',
      });

      expect(movement.type).toBe(MovementType.SAFE_DROP);
      expect(movement.amount.toDecimal()).toBe(300);
      expect(movement.safeDropDetails).toBeDefined();
      expect(movement.safeDropDetails?.envelopeNumber).toBe('SOBRE-2026-089');
      expect(movement.safeDropDetails?.bagSealNumber).toBe('PREC-774411');
      expect(movement.safeDropDetails?.witness?.name).toBe('Javier Guardia');
      expect(movement.safeDropDetails?.destinationVault).toBe('BÓVEDA DEPARTAMENTO TESORERÍA');

      // Evento de dominio emitido con los detalles de remesa
      const safeDropEvent = emittedEvents.find((e) => e instanceof SafeDropPerformedEvent) as SafeDropPerformedEvent;
      expect(safeDropEvent).toBeDefined();
      expect(safeDropEvent.amount.toDecimal()).toBe(300);
      expect(safeDropEvent.safeDropDetails?.envelopeNumber).toBe('SOBRE-2026-089');
      expect(safeDropEvent.safeDropDetails?.bagSealNumber).toBe('PREC-774411');

      // Serialización y rehidratación JSON de CashMovement
      const movementJson = movement.toJSON();
      expect(movementJson.safeDropDetails?.envelopeNumber).toBe('SOBRE-2026-089');
      const restoredMovement = CashMovement.fromJSON(movementJson);
      expect(restoredMovement.safeDropDetails?.envelopeNumber).toBe('SOBRE-2026-089');
      expect(restoredMovement.safeDropDetails?.witness?.name).toBe('Javier Guardia');
    });

    it('debe formatear el comprobante de remesa en texto plano y secuencias ESC/POS con soporte dual', () => {
      const formatter = new EscPosTicketFormatter({
        columnWidth: 42,
        storeName: 'SUPERMERCADO CENTRAL S.A.',
        storeAddress: 'Av. Siempre Viva 742',
        storeTaxId: 'RFC-SCM900101-ABC',
      });

      const movement = new CashMovement({
        id: 'mov-drop-99',
        shiftId: 'shift-sd-99',
        type: MovementType.SAFE_DROP,
        amount: { toDecimal: () => 450, toString: () => '450.00 USD', currency: 'USD', isPositive: () => true } as any,
        paymentMethod: PaymentMethod.CASH,
        concept: 'Retiro parcial de seguridad por exceso de efectivo',
        performedBy: cashier,
        safeDropDetails: {
          envelopeNumber: 'SOBRE-00452',
          bagSealNumber: 'SEAL-889922',
          destinationVault: 'BÓVEDA PRINCIPAL',
          witness: { id: 'sup-1', name: 'Carlos Supervisor' },
        },
        sequenceNumber: 14,
        timestamp: new Date('2026-11-12T16:00:00Z'),
      });

      // 1. Formateo texto plano
      const plainText = formatter.formatSafeDropReceiptPlainText(movement, 'Ana Cajera');
      expect(plainText).toContain('SUPERMERCADO CENTRAL S.A.');
      expect(plainText).toContain('COMPROBANTE DE REMESA / SAFE DROP');
      expect(plainText).toContain('SOBRE-00452');
      expect(plainText).toContain('SEAL-889922');
      expect(plainText).toContain('Carlos Supervisor');
      expect(plainText).toContain('BÓVEDA PRINCIPAL');
      expect(plainText).toContain('FIRMA ENTREGA (CAJERO)');
      expect(plainText).toContain('FIRMA RECIBE (TESTIGO / BÓVEDA)');

      // 2. Formateo ESC/POS Dual (Cajero + Bóveda)
      const escPosDual = formatter.formatSafeDropReceiptEscPos(movement, 'Ana Cajera', { dualReceipt: true });
      expect(escPosDual).toContain('COPIA CAJERO / GAVETA');
      expect(escPosDual).toContain('COPIA BÓVEDA / TRASLADO');
      expect(escPosDual).toContain(ESC_POS_COMMANDS.PARTIAL_CUT);

      // 3. Bytes binarios CP858 listos para impresora térmica
      const bytes = formatter.formatSafeDropReceiptEscPosBytes(movement, 'Ana Cajera', { dualReceipt: true });
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(100);
    });
  });
});

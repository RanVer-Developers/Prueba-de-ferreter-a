// @vitest-environment happy-dom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  CashierOptions,
  CashierProvider,
  CashRegister,
  DomainEvent,
  IdentityOnlyAuthorizationPolicy,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  InvalidSignatureError,
  ISignatureVerifier,
  Money,
  OriginalSaleNotFoundError,
  PaymentMethod,
  SupervisorApprovalRequiredError,
  useCashier,
  useCashierContext,
  useShift,
} from '../src/index.js';

describe('@modulos/cashier-react Hooks', () => {
  const cashier = { id: 'usr-react-1', name: 'Laura Cajera React', role: 'CASHIER' };
  const supervisor = { id: 'sup-react-1', name: 'Carlos Supervisor', role: 'SUPERVISOR' };

  const createWrapper = (extra?: {
    currency?: string;
    options?: CashierOptions;
    onDomainEvent?: (event: DomainEvent) => void | Promise<void>;
    extraRegisters?: CashRegister[];
  }) => {
    const registerRepo = new InMemoryCashRegisterRepository();
    const shiftRepo = new InMemoryCashShiftRepository();

    const register = new CashRegister({
      id: 'pos-terminal-01',
      name: 'Terminal Mostrador React',
      currency: extra?.currency || 'USD',
    });
    registerRepo.save(register);

    if (extra?.extraRegisters) {
      for (const r of extra.extraRegisters) {
        registerRepo.save(r);
      }
    }

    const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <CashierProvider
        registerRepo={registerRepo}
        shiftRepo={shiftRepo}
        defaultRegisterId="pos-terminal-01"
        options={extra?.options}
        onDomainEvent={extra?.onDomainEvent}
      >
        {children}
      </CashierProvider>
    );

    return { Wrapper, registerRepo, shiftRepo };
  };

  it('debe calcular cambio en vivo con calculateLiveChange de forma inmediata', () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCashier(), { wrapper: Wrapper });

    const live = result.current.calculateLiveChange(300, 200, 500);

    expect(live.cashRequired).toBe(100);
    expect(live.changeGiven).toBe(400);
  });

  it('debe gestionar el ciclo de vida reactivo completo: apertura, cobro mixto, pausa, reporte X, cierre y reporte Z post-cierre', async () => {
    const events: DomainEvent[] = [];
    const onDomainEvent = vi.fn((ev: DomainEvent) => {
      events.push(ev);
    });
    const { Wrapper } = createWrapper({ onDomainEvent });

    const { result } = renderHook(() => ({
      cashier: useCashier(),
      shift: useShift(),
    }), { wrapper: Wrapper });

    expect(result.current.shift.isOpen).toBe(false);

    await act(async () => {
      await result.current.cashier.openShift({
        shiftId: 'shift-react-01',
        cashier,
        initialAmount: 500,
        openingNotes: 'Apertura desde app React POS',
      });
    });

    expect(result.current.shift.isOpen).toBe(true);
    expect(result.current.shift.expectedCash?.toDecimal()).toBe(500);

    await act(async () => {
      const paymentResult = await result.current.cashier.recordPayment({
        transactionReference: 'TK-REACT-100',
        ticketTotal: 300,
        payments: [
          { id: 'p-card', method: PaymentMethod.CREDIT_CARD, amount: 200 },
        ],
        tenderedCash: 500,
        performedBy: cashier,
      });

      expect(paymentResult.cashRequired.toDecimal()).toBe(100);
      expect(paymentResult.changeGiven.toDecimal()).toBe(400);
    });

    expect(result.current.shift.expectedCash?.toDecimal()).toBe(600);

    // Reporte X con turno abierto (usa activeShift.id automáticamente)
    let reportX: any;
    await act(async () => {
      reportX = await result.current.cashier.generateAuditReport('X');
    });
    expect(reportX.reportType).toBe('X');
    expect(reportX.grossSales).toBe(300);

    await act(async () => {
      await result.current.cashier.suspendShift('Salida a colación');
    });
    expect(result.current.shift.isSuspended).toBe(true);

    await act(async () => {
      await result.current.cashier.resumeShift();
    });
    expect(result.current.shift.isOpen).toBe(true);

    let closedShift: any;
    await act(async () => {
      closedShift = await result.current.cashier.closeShift({
        declaredCashAmount: 600,
        closingNotes: 'Cierre reactivo sin descuadres',
      });
    });

    expect(result.current.shift.isOpen).toBe(false);
    expect(result.current.shift.isClosed).toBe(true);
    expect(closedShift.isClosed()).toBe(true);
    expect(closedShift.reconciliation?.cashStatus).toBe('EXACT');

    // Reporte Z inmediatamente después de cerrar usando lastShiftId (sin pasar shiftId)
    let reportZ: any;
    await act(async () => {
      reportZ = await result.current.cashier.generateAuditReport('Z');
    });
    expect(reportZ.reportType).toBe('Z');
    expect(reportZ.shiftId).toBe('shift-react-01');

    // Reporte Z pasando shiftId explícito también funciona
    let reportZExplicit: any;
    await act(async () => {
      reportZExplicit = await result.current.cashier.generateAuditReport('Z', 'shift-react-01');
    });
    expect(reportZExplicit.reportType).toBe('Z');

    // Eventos publicados por cada operación
    expect(events.map((e) => e.eventName)).toEqual([
      'CashShift.Opened',
      'CashShift.MovementRecorded',
      'CashShift.MovementRecorded',
      'CashShift.Suspended',
      'CashShift.Resumed',
      'CashShift.Closed',
    ]);
  });

  it('debe ejecutar openDrawerNoSale, safeDrop con sobre/precinto y retención de fondo con useCashier', async () => {
    const { Wrapper, registerRepo } = createWrapper();

    const { result } = renderHook(() => ({
      cashier: useCashier(),
      shift: useShift(),
    }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cashier.openShift({
        shiftId: 'shift-react-02',
        cashier,
        initialAmount: 400,
        cashBreakdownCounts: { 20: 20 },
      });
    });

    expect(result.current.shift.isOpen).toBe(true);

    let kickResult: any;
    await act(async () => {
      kickResult = await result.current.cashier.openDrawerNoSale({
        reason: 'Inspección de efectivo en gaveta',
      });
    });

    expect(kickResult.reason).toBe('Inspección de efectivo en gaveta');
    expect(kickResult.escPosCommand).toBeDefined();
    expect(kickResult.escPosBytes).toBeInstanceOf(Uint8Array);
    expect(result.current.shift.drawerOpenHistory).toHaveLength(1);

    let dropMovement: any;
    await act(async () => {
      dropMovement = await result.current.cashier.safeDrop({
        amount: 200,
        reason: 'Remesa a bóveda',
        performedBy: cashier,
        envelopeNumber: 'ENV-REACT-99',
        bagSealNumber: 'SEAL-REACT-101',
        witness: { id: 'sup-1', name: 'Supervisor React' },
        destinationVault: 'BÓVEDA PRINCIPAL',
        breakdownCounts: { 20: 10 },
      });
    });

    expect(dropMovement.amount.toDecimal()).toBe(200);
    expect(dropMovement.safeDropDetails?.envelopeNumber).toBe('ENV-REACT-99');
    expect(result.current.shift.expectedCash?.toDecimal()).toBe(200);

    await act(async () => {
      await result.current.cashier.closeShift({
        declaredCashAmount: 200,
        retainedFloatAmount: 100,
        retainedBreakdownCounts: { 20: 5 },
      });
    });

    const reg = await registerRepo.findById('pos-terminal-01');
    expect(reg?.carryOverFloat?.toDecimal()).toBe(100);
    expect(reg?.carryOverBreakdown?.getCount(20)).toBe(5);
  });

  it('debe soportar recordRefund, voidPayment, auditCount, handoverShift y lockTerminal/unlockTerminal', async () => {
    const { Wrapper } = createWrapper({
      options: {
        authorizationPolicy: new IdentityOnlyAuthorizationPolicy(),
      },
    });

    const { result } = renderHook(() => ({
      cashier: useCashier(),
      shift: useShift(),
    }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.cashier.openShift({
        shiftId: 'shift-react-ops',
        cashier,
        initialAmount: 300,
        cashBreakdownCounts: { 50: 4, 20: 5 },
      });
    });

    // Cobro 1 en efectivo para luego reembolsar parcialmente
    await act(async () => {
      await result.current.cashier.recordPayment({
        transactionReference: 'TK-REF-1',
        ticketTotal: 100,
        payments: [{ id: 'p-c1', method: PaymentMethod.CASH }],
        tenderedCash: 100,
        tenderedBreakdownCounts: { 50: 2 },
        performedBy: cashier,
      });
    });

    // Cobro 2 con tarjeta para luego anular (void)
    let cardPayment: any;
    await act(async () => {
      cardPayment = await result.current.cashier.recordPayment({
        transactionReference: 'TK-VOID-1',
        ticketTotal: 40,
        payments: [{ id: 'p-card', method: PaymentMethod.CREDIT_CARD, amount: 40 }],
        performedBy: cashier,
      });
    });

    // Reembolso parcial en efectivo con desglose físico y autorización
    await act(async () => {
      const refMov = await result.current.cashier.recordRefund({
        movementId: 'ref-react-1',
        amount: 50,
        paymentMethod: PaymentMethod.CASH,
        concept: 'Devolución parcial',
        referenceId: 'TK-REF-1',
        performedBy: cashier,
        authorizedBy: { id: 'peer-1', name: 'Par Autorizador', role: 'CASHIER' },
        paidOutBreakdownCounts: { 50: 1 },
      });
      expect(refMov.amount.toDecimal()).toBe(50);
    });
    expect(result.current.shift.expectedCash?.toDecimal()).toBe(350);

    // Anulación de cobro con tarjeta (permitida por IdentityOnlyAuthorizationPolicy desde options)
    await act(async () => {
      const voidMov = await result.current.cashier.voidPayment({
        movementIdToVoid: cardPayment.movements[0].id,
        reason: 'Error en cobro tarjeta',
        authorizedBy: { id: 'peer-2', name: 'Par Anulador', role: 'CASHIER' },
      });
      expect(voidMov.type).toBe('VOID');
    });

    // Arqueo intermedio (auditCount)
    await act(async () => {
      const audit = await result.current.cashier.auditCount({
        declaredCashAmount: 350,
        isBlindCount: true,
        notes: 'Arqueo intermedio reactivo',
      });
      expect(audit.cashStatus).toBe('EXACT');
    });

    // Relevo de cajero (handoverShift)
    const incomingCashier = { id: 'usr-react-2', name: 'Mario Cajero', role: 'CASHIER' };
    await act(async () => {
      const handover = await result.current.cashier.handoverShift({
        incomingCashier,
        declaredCashAmount: 350,
        notes: 'Cambio de turno tarde',
      });
      expect(handover.shift.cashier.id).toBe('usr-react-2');
    });
    expect(result.current.shift.shift?.cashier.id).toBe('usr-react-2');

    // Bloqueo y desbloqueo de terminal
    await act(async () => {
      await result.current.cashier.lockTerminal('Cajero fue a bóveda');
    });
    expect(result.current.shift.isLocked).toBe(true);

    await act(async () => {
      await result.current.cashier.unlockTerminal(supervisor);
    });
    expect(result.current.shift.isOpen).toBe(true);
    expect(result.current.shift.isLocked).toBe(false);
  });

  it('debe propagar options (discrepancyTolerance, signatureVerifier, refundPolicy) en CashierProvider', async () => {
    const signatureVerifier: ISignatureVerifier = {
      verify: ({ token, supervisorId }) => token === `SIG_${supervisorId}`,
    };

    const { Wrapper } = createWrapper({
      options: {
        discrepancyTolerance: 5,
        signatureVerifier,
        refundPolicy: { requireLinkedSale: true },
      },
    });

    const { result } = renderHook(() => useCashier(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.openShift({
        shiftId: 'shift-react-opts',
        cashier,
        initialAmount: 100,
      });
    });

    // refundPolicy.requireLinkedSale rechaza reembolso sin venta vinculada
    await act(async () => {
      await expect(
        result.current.recordRefund({
          amount: 10,
          paymentMethod: PaymentMethod.CASH,
          concept: 'Devolución sin ticket',
          performedBy: cashier,
        })
      ).rejects.toThrow(OriginalSaleNotFoundError);
    });

    // Descuadre de $20 (> tolerancia $5) sin supervisor falla con SupervisorApprovalRequiredError
    await act(async () => {
      await expect(
        result.current.closeShift({
          declaredCashAmount: 80,
        })
      ).rejects.toThrow(SupervisorApprovalRequiredError);
    });

    // Con supervisor pero firma inválida falla con InvalidSignatureError
    await act(async () => {
      await expect(
        result.current.closeShift({
          declaredCashAmount: 80,
          supervisor,
          signatureToken: 'BAD_SIG',
        })
      ).rejects.toThrow(InvalidSignatureError);
    });

    // Con supervisor y firma válida cierra el turno
    await act(async () => {
      const closed = await result.current.closeShift({
        declaredCashAmount: 80,
        supervisor,
        signatureToken: `SIG_${supervisor.id}`,
      });
      expect(closed.isClosed()).toBe(true);
    });
  });

  it('debe poblar error cuando no hay turno activo, limpiarlo con clearError y soportar cambio de caja y monedas ISO 4217', async () => {
    const registerJPY = new CashRegister({
      id: 'pos-terminal-jpy',
      name: 'Caja Tokio',
      currency: 'JPY',
    });

    const { Wrapper } = createWrapper({ extraRegisters: [registerJPY] });

    const { result } = renderHook(() => ({
      ctx: useCashierContext(),
      cashier: useCashier(),
      shift: useShift(),
    }), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.shift.isLoading).toBe(false);
    });

    // Sin turno activo: error se captura en result.current.cashier.error
    await act(async () => {
      await expect(
        result.current.cashier.recordPayment({
          transactionReference: 'TK-NO-SHIFT',
          ticketTotal: 10,
          payments: [{ id: 'p1', method: PaymentMethod.CASH }],
          performedBy: cashier,
        })
      ).rejects.toThrow('No hay un turno activo');
    });
    expect(result.current.cashier.error?.message).toContain('No hay un turno activo');

    act(() => {
      result.current.cashier.clearError();
    });
    expect(result.current.cashier.error).toBeNull();

    // Cambio de caja a JPY verifica formato exacto de cero sin asumir '$0.00'
    act(() => {
      result.current.ctx.setCurrentRegisterId('pos-terminal-jpy');
    });

    await waitFor(() => {
      expect(result.current.shift.register?.id).toBe('pos-terminal-jpy');
    });

    expect(result.current.shift.expectedCashFormatted).toBe(Money.zero('JPY').format());
  });
});

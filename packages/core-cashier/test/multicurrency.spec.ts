import { beforeEach, describe, expect, it } from 'vitest';
import {
  CashRegister,
  ExchangeRate,
  InMemoryCashRegisterRepository,
  InMemoryCashShiftRepository,
  Money,
  OpenShiftUseCase,
  PaymentMethod,
  RecordPaymentUseCase,
} from '../src/index.js';

describe('Multimoneda Activa con Tasas de Cambio', () => {
  let registerRepo: InMemoryCashRegisterRepository;
  let shiftRepo: InMemoryCashShiftRepository;
  const cashier = { id: 'usr-1', name: 'Laura Gómez' };

  beforeEach(async () => {
    registerRepo = new InMemoryCashRegisterRepository();
    shiftRepo = new InMemoryCashShiftRepository();

    // Negocio con moneda base Pesos Mexicanos (MXN)
    const register = new CashRegister({
      id: 'reg-cancun-1',
      name: 'Caja Sucursal Cancún',
      currency: 'MXN',
    });
    await registerRepo.save(register);
  });

  it('debe convertir pagos en moneda extranjera a la moneda base del turno', async () => {
    const openUseCase = new OpenShiftUseCase(registerRepo, shiftRepo);
    const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

    await openUseCase.execute({
      shiftId: 'shift-mxn-1',
      cashRegisterId: 'reg-cancun-1',
      cashier,
      initialAmount: 2000, // 2000 MXN en caja
    });

    // Tasa: 1 USD = 20.00 MXN
    const usdRate = new ExchangeRate({
      fromCurrency: 'USD',
      toCurrency: 'MXN',
      rate: 20.00,
    });

    // Ticket de 1,000 MXN pagado con $50 USD
    const result = await paymentUseCase.execute({
      shiftId: 'shift-mxn-1',
      transactionReference: 'FOLIO-881',
      ticketTotal: 1000,
      payments: [
        {
          id: 'pay-usd',
          method: PaymentMethod.DIGITAL_WALLET,
          exchangeRate: usdRate,
          foreignAmount: 50,
          reference: 'PAYPAL-USD-01',
        },
      ],
      performedBy: cashier,
    });

    expect(result.totalPaid.toDecimal()).toBe(1000);
    expect(result.totalPaid.currency).toBe('MXN');

    const mov = result.movements[0];
    expect(mov.amount.toDecimal()).toBe(1000);
    expect(mov.foreignAmount?.toDecimal()).toBe(50);
    expect(mov.foreignAmount?.currency).toBe('USD');
    expect(mov.exchangeRate?.rate).toBe(20.00);
  });
});

import { describe, expect, it } from 'vitest';
import { createFerre, FerreError } from '../src/data/ferre';
import { computeKpis } from '../src/data/kpis';
import { MemoryStore } from '../src/data/kv-store';

async function setup() {
  const store = new MemoryStore();
  const ferre = await createFerre(store);
  const staff = await ferre.listStaff();
  const login = (id: string, pin: string) => ferre.login(id, pin);
  void staff;
  return { store, ferre, login };
}

describe('Ferre Aguilar runtime', () => {
  it('rejects wrong PIN and logs the failure', async () => {
    const { ferre } = await setup();
    await expect(ferre.login('usr-cajera', '9999')).rejects.toBeInstanceOf(FerreError);
    expect((await ferre.listAudit())[0]?.action).toBe('LOGIN_FAILED');
  });

  it('locks after 5 failed PINs', async () => {
    const { ferre } = await setup();
    for (let i = 0; i < 5; i++) await ferre.login('usr-cajera', '0000').catch(() => undefined);
    await expect(ferre.login('usr-cajera', '3003')).rejects.toThrow(/Demasiados/);
  });

  it('sells at the counter, computes change and updates stock', async () => {
    const { ferre, login } = await setup();
    const cajera = await login('usr-cajera', '3003');
    await ferre.openShift(cajera, 50000);
    const ticket = await ferre.sell(cajera, [{ sku: 'MART-001', quantity: 2 }], 'CASH', 50000);
    expect(ticket.totalCents).toBe(29000);
    expect(ticket.changeCents).toBe(21000);
    const hammer = (await ferre.listProducts()).find((p) => p.id === 'MART-001');
    expect(hammer?.stock).toBe(22);
  });

  it('blocks selling more than the stock', async () => {
    const { ferre, login } = await setup();
    const cajera = await login('usr-cajera', '3003');
    await ferre.openShift(cajera, 0);
    await expect(ferre.sell(cajera, [{ sku: 'CAND-50', quantity: 99 }], 'DEBIT_CARD', 0)).rejects.toThrow(/existencia/);
  });

  it('driver cannot sell; denial is logged as alert', async () => {
    const { ferre, login } = await setup();
    const chofer = await login('usr-chofer', '6006');
    await expect(ferre.sell(chofer, [{ sku: 'MART-001', quantity: 1 }], 'CASH', 99999)).rejects.toThrow(/permiso/);
    expect((await ferre.listAudit()).some((a) => a.action === 'DENIED' && a.risk === 'alert')).toBe(true);
  });

  it('voiding needs a valid supervisor PIN, restocks and refunds cash', async () => {
    const { ferre, login } = await setup();
    const cajera = await login('usr-cajera', '3003');
    await ferre.openShift(cajera, 10000);
    const t = await ferre.sell(cajera, [{ sku: 'DEST-PH2', quantity: 1 }], 'CASH', 5000);
    await expect(ferre.voidTicket(cajera, t.id, 'Error de captura', 'usr-vendedor', '4004')).rejects.toThrow(/PIN correcto/);
    await ferre.voidTicket(cajera, t.id, 'Error de captura', 'usr-encargado', '2002');
    expect((await ferre.listProducts()).find((p) => p.id === 'DEST-PH2')?.stock).toBe(40);
    expect((await ferre.listTickets())[0]?.status).toBe('VOIDED');
    expect(await ferre.expectedCash((await ferre.getOpenShift())!.id)).toBe(10000);
  });

  it('close shift reveals the difference and flags it', async () => {
    const { ferre, login } = await setup();
    const cajera = await login('usr-cajera', '3003');
    await ferre.openShift(cajera, 10000);
    await ferre.sell(cajera, [{ sku: 'DEST-PH2', quantity: 1 }], 'CASH', 4800);
    const r = await ferre.closeShift(cajera, 14000);
    expect(r.expectedCents).toBe(14800);
    expect(r.differenceCents).toBe(-800);
    expect((await ferre.listAudit()).some((a) => a.action === 'SHIFT_CLOSE' && a.risk === 'alert')).toBe(true);
  });

  it('open shift survives a reload (rehydrates from the local store)', async () => {
    const { store, ferre, login } = await setup();
    const cajera = await login('usr-cajera', '3003');
    await ferre.openShift(cajera, 10000);
    await ferre.sell(cajera, [{ sku: 'DEST-PH2', quantity: 2 }], 'CASH', 10000);
    const reloaded = await createFerre(store);
    const shift = await reloaded.getOpenShift();
    expect(shift).not.toBeNull();
    expect(await reloaded.expectedCash(shift!.id)).toBe(10000 + 9600);
    expect((await reloaded.listProducts()).find((p) => p.id === 'DEST-PH2')?.stock).toBe(38);
  });

  it('receiving a purchase adds stock and updates cost; adjust logs shrinkage as alert', async () => {
    const { ferre, login } = await setup();
    const bodega = await login('usr-bodeguero', '5005');
    await ferre.receivePurchase(bodega, { supplier: 'Truper', sku: 'CAND-50', quantity: 10, unitCostCents: 7200 });
    expect((await ferre.listProducts()).find((p) => p.id === 'CAND-50')?.stock).toBe(14);
    await ferre.adjustStock(bodega, 'CAND-50', 12, 'Conteo físico');
    const p = (await ferre.listProducts()).find((x) => x.id === 'CAND-50');
    expect(p?.stock).toBe(12);
    expect((await ferre.listAudit()).find((a) => a.action === 'STOCK_ADJUST')?.risk).toBe('alert');
  });

  it('computes KPIs in cents', async () => {
    const { ferre, login } = await setup();
    const cajera = await login('usr-cajera', '3003');
    await ferre.openShift(cajera, 0);
    await ferre.sell(cajera, [{ sku: 'MART-001', quantity: 1 }], 'DEBIT_CARD', 0);
    const k = computeKpis(await ferre.listTickets(), await ferre.listProducts(), await ferre.listAudit(), new Date());
    expect(k.salesCents).toBe(14500);
    expect(k.grossProfitCents).toBe(14500 - 9800);
    expect(k.lowStock.map((p) => p.id)).toContain('CAND-50');
  });
});

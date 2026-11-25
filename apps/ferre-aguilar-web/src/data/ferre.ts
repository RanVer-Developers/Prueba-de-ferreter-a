import { PaymentMethod, MovementType } from '@modulos/core-cashier';
import { InventoryItem } from '@modulos/core-inventory';
import { generateId } from '@modulos/core-shared';
import {
  createFerreAguilarCore,
  roleHasPermission,
  type FerreAguilarCore,
  type FerreAguilarRoleCode,
} from '@ferre-aguilar/core';
import type { LocalStore } from './kv-store';
import { DEMO_CUSTOMERS, DEMO_PRODUCTS, DEMO_STAFF } from './seed';
import type {
  AuditAction,
  AuditRecord,
  CreditPaymentRecord,
  CustomerRecord,
  MovementRecord,
  PaymentKind,
  ProductRecord,
  PurchaseRecord,
  ShiftRecord,
  StaffRecord,
  TicketItem,
  TicketRecord,
} from './types';

const WAREHOUSE = 'main-warehouse';
const REGISTER = 'caja-1';
const MAX_ERRORS = 50;
const MAX_FAILED_PINS = 5;

export interface Session {
  userId: string;
  name: string;
  role: FerreAguilarRoleCode;
}

export class FerreError extends Error {}

async function hashPin(userId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`ferre-aguilar:${userId}:${pin}`);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    let h = 2166136261;
    for (const b of data) h = Math.imul(h ^ b, 16777619) >>> 0;
    return `fnv:${h.toString(16)}`;
  }
  const digest = await subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CASHIER_PAYMENT_MAP: Record<'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER', PaymentMethod> = {
  CASH: PaymentMethod.CASH,
  DEBIT_CARD: PaymentMethod.DEBIT_CARD,
  BANK_TRANSFER: PaymentMethod.BANK_TRANSFER,
};

export async function createFerre(store: LocalStore) {
  const core: FerreAguilarCore = createFerreAguilarCore();
  let failedPins = 0;

  async function log(user: string, action: AuditAction, detail: string, risk: AuditRecord['risk'] = 'normal') {
    await store.put('audit', { id: generateId('aud'), at: new Date().toISOString(), userName: user, action, detail, risk });
  }

  async function logError(screen: string, action: string, error: unknown) {
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    await store.put('errors', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), screen, action, detail });
    const all = (await store.getAll('errors')).sort((a, b) => a.at.localeCompare(b.at));
    for (const old of all.slice(0, Math.max(0, all.length - MAX_ERRORS))) await store.remove('errors', old.id);
  }

  async function requirePermission(session: Session, permission: string) {
    if (roleHasPermission(session.role, permission)) return;
    await log(session.name, 'DENIED', `Intentó una acción sin permiso (${permission})`, 'alert');
    throw new FerreError('No tienes permiso para hacer esto. Pídele ayuda al Encargado.');
  }

  async function syncStock(sku: string) {
    const product = (await store.getAll('products')).find((p) => p.id === sku);
    if (!product) return;
    const a = await core.inventory.getStockAvailability({ itemId: sku, warehouseId: WAREHOUSE });
    await store.put('products', { ...product, stock: a.totalAvailable });
  }

  async function syncCustomerBalance(customerId: string) {
    const rec = (await store.getAll('customers')).find((c) => c.id === customerId);
    if (!rec) return;
    const loaded = await core.customers.repositories.customerRepo.findById(customerId);
    if (!loaded) return;
    await store.put('customers', { ...rec, creditUsedCents: loaded.creditBalanceCents });
  }

  async function loadProductIntoCore(p: ProductRecord) {
    await core.inventory.repositories.itemRepo.save(new InventoryItem({ id: p.id, sku: p.id, name: p.name }));
    if (p.stock > 0) {
      await core.inventory.recordStockIn({
        itemId: p.id,
        warehouseId: WAREHOUSE,
        quantity: p.stock,
        unitCost: { amount: p.costCents, currency: 'MXN' },
        performedBy: { id: 'system', name: 'Sistema', role: 'OWNER' },
      });
    }
  }

  async function loadCustomerIntoCore(c: CustomerRecord) {
    await core.customers.createCustomer({
      id: c.id,
      displayName: c.displayName,
      phone: c.phone || undefined,
      creditLimitCents: c.creditLimitCents,
      creditTermDays: c.creditTermDays,
    });
    if (c.creditUsedCents > 0) {
      await core.customers.chargeCredit({
        customerId: c.id,
        amountCents: c.creditUsedCents,
        referenceId: `hydrate:${c.id}`,
        idempotencyKey: `hydrate:${c.id}`,
      });
    }
  }

  async function replayShift(shift: ShiftRecord) {
    await core.cashier.openShift({
      shiftId: shift.id,
      cashRegisterId: REGISTER,
      cashier: { id: shift.cashierId, name: shift.cashierName, role: 'CASHIER' },
      initialAmount: shift.initialCents / 100,
    });
    const tickets = (await store.getAll('tickets')).filter((t) => t.shiftId === shift.id && t.method !== 'CREDIT');
    for (const t of tickets) {
      const m = CASHIER_PAYMENT_MAP[t.method as 'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER'];
      await core.cashier.recordPayment({
        shiftId: shift.id,
        transactionReference: t.id,
        ticketTotal: t.totalCents / 100,
        concept: `Venta ${t.id}`,
        payments: [{ id: `pmt-${t.id}`, method: m, amount: t.totalCents / 100 }],
        tenderedCash: t.method === 'CASH' ? t.totalCents / 100 : undefined,
        idempotencyKey: `replay:${t.id}`,
        performedBy: { id: t.cashierId, name: t.cashierName, role: 'CASHIER' },
      });
    }
    const creditPays = (await store.getAll('creditPayments')).filter((p) => p.shiftId === shift.id);
    for (const p of creditPays) {
      await core.cashier.recordPayment({
        shiftId: shift.id,
        transactionReference: p.id,
        ticketTotal: p.amountCents / 100,
        concept: `Abono ${p.customerName}`,
        payments: [{ id: `pmt-${p.id}`, method: CASHIER_PAYMENT_MAP[p.method], amount: p.amountCents / 100 }],
        tenderedCash: p.method === 'CASH' ? p.amountCents / 100 : undefined,
        idempotencyKey: `replay-cp:${p.id}`,
        performedBy: { id: p.byName, name: p.byName, role: 'CASHIER' },
      });
    }
    const movements = (await store.getAll('movements')).filter((m) => m.shiftId === shift.id);
    for (const m of movements) {
      await core.cashier.recordMovement({
        movementId: m.id,
        shiftId: shift.id,
        type: m.kind === 'IN' ? MovementType.MANUAL_DEPOSIT : MovementType.MANUAL_WITHDRAWAL,
        amount: m.amountCents / 100,
        paymentMethod: PaymentMethod.CASH,
        concept: m.concept,
        idempotencyKey: `replay:${m.id}`,
        performedBy: { id: m.byName, name: m.byName, role: 'CASHIER' },
      });
    }
  }

  // ---- bootstrap / hydrate ----
  await core.bootstrapDefaultRoles();
  await core.ensureMainWarehouse();
  await core.cashier.createRegister({ id: REGISTER, name: 'Caja mostrador', branchId: 'tienda-unica' });

  if ((await store.getAll('staff')).length === 0) {
    for (const s of DEMO_STAFF) {
      await store.put('staff', { id: s.id, displayName: s.displayName, roleCode: s.roleCode, pinHash: await hashPin(s.id, s.pin), active: true });
    }
    for (const p of DEMO_PRODUCTS) await store.put('products', p);
  }
  if ((await store.getAll('customers')).length === 0) {
    for (const c of DEMO_CUSTOMERS) await store.put('customers', c);
  }
  for (const p of await store.getAll('products')) await loadProductIntoCore(p);
  for (const c of await store.getAll('customers')) await loadCustomerIntoCore(c);
  const openShift = (await store.getAll('shifts')).find((s) => s.status === 'OPEN');
  if (openShift) await replayShift(openShift);

  // ---- public API ----
  return {
    async login(userId: string, pin: string): Promise<Session> {
      const staff = (await store.getAll('staff')).find((s) => s.id === userId && s.active);
      if (failedPins >= MAX_FAILED_PINS) {
        throw new FerreError('Demasiados intentos. Pídele ayuda al Dueño o al Encargado.');
      }
      if (!staff || staff.pinHash !== (await hashPin(staff.id, pin))) {
        failedPins += 1;
        await log(staff?.displayName ?? 'Desconocido', 'LOGIN_FAILED', 'PIN incorrecto', failedPins >= 3 ? 'alert' : 'normal');
        throw new FerreError('Ese PIN no es correcto.');
      }
      failedPins = 0;
      await log(staff.displayName, 'LOGIN', 'Entró al sistema');
      return { userId: staff.id, name: staff.displayName, role: staff.roleCode };
    },

    can: (session: Session, permission: string) => roleHasPermission(session.role, permission),
    listStaff: async (): Promise<StaffRecord[]> => (await store.getAll('staff')).filter((s) => s.active),
    listProducts: async () => (await store.getAll('products')).sort((a, b) => a.name.localeCompare(b.name)),
    listCustomers: async () => (await store.getAll('customers')).filter((c) => c.active).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    listCreditPayments: async () => (await store.getAll('creditPayments')).sort((a, b) => b.at.localeCompare(a.at)),
    listTickets: async () => (await store.getAll('tickets')).sort((a, b) => b.at.localeCompare(a.at)),
    listMovements: async () => (await store.getAll('movements')).sort((a, b) => b.at.localeCompare(a.at)),
    listPurchases: async () => (await store.getAll('purchases')).sort((a, b) => b.at.localeCompare(a.at)),
    listAudit: async () => (await store.getAll('audit')).sort((a, b) => b.at.localeCompare(a.at)),
    listErrors: async () => (await store.getAll('errors')).sort((a, b) => b.at.localeCompare(a.at)),
    getOpenShift: async () => (await store.getAll('shifts')).find((s) => s.status === 'OPEN') ?? null,
    listShifts: async () => (await store.getAll('shifts')).sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    logError,

    async expectedCash(shiftId: string): Promise<number> {
      const r = await core.cashier.getShiftSummary(shiftId);
      return r.summary.currentCashInDrawer.toCents();
    },

    async openShift(session: Session, initialCents: number): Promise<ShiftRecord> {
      await requirePermission(session, 'cashier:open_close');
      if (await this.getOpenShift()) throw new FerreError('Ya hay una caja abierta.');
      const shift: ShiftRecord = {
        id: generateId('shift'), cashierId: session.userId, cashierName: session.name,
        openedAt: new Date().toISOString(), initialCents, status: 'OPEN',
      };
      await core.cashier.openShift({
        shiftId: shift.id, cashRegisterId: REGISTER,
        cashier: { id: session.userId, name: session.name, role: 'CASHIER' },
        initialAmount: initialCents / 100,
      });
      await store.put('shifts', shift);
      await log(session.name, 'SHIFT_OPEN', `Abrió caja con ${initialCents / 100} pesos`);
      return shift;
    },

    async cashMovement(session: Session, kind: 'IN' | 'OUT', amountCents: number, concept: string): Promise<void> {
      await requirePermission(session, 'cashier:charge');
      const shift = await this.getOpenShift();
      if (!shift) throw new FerreError('Primero abre la caja.');
      if (!Number.isInteger(amountCents) || amountCents <= 0) throw new FerreError('Escribe un monto mayor a cero.');
      if (concept.trim().length < 3) throw new FerreError('Escribe para qué es el movimiento.');
      const id = generateId('mov');
      await core.cashier.recordMovement({
        movementId: id, shiftId: shift.id,
        type: kind === 'IN' ? MovementType.MANUAL_DEPOSIT : MovementType.MANUAL_WITHDRAWAL,
        amount: amountCents / 100, paymentMethod: PaymentMethod.CASH, concept: concept.trim(), idempotencyKey: id,
        performedBy: { id: session.userId, name: session.name, role: session.role },
      });
      const rec: MovementRecord = { id, shiftId: shift.id, at: new Date().toISOString(), kind, amountCents, concept: concept.trim(), byName: session.name };
      await store.put('movements', rec);
      await log(session.name, 'CASH_MOVEMENT', `${kind === 'IN' ? 'Entrada' : 'Salida'} de ${amountCents / 100} pesos: ${concept.trim()}`, kind === 'OUT' ? 'alert' : 'normal');
    },

    /** Cash count cut: the cashier declares cash; the difference is revealed and logged. */
    async closeShift(session: Session, declaredCents: number): Promise<{ expectedCents: number; differenceCents: number }> {
      await requirePermission(session, 'cashier:open_close');
      const shift = await this.getOpenShift();
      if (!shift) throw new FerreError('No hay caja abierta.');
      const expectedCents = await this.expectedCash(shift.id);
      const differenceCents = declaredCents - expectedCents;
      await core.cashier.closeShift({
        shiftId: shift.id, declaredCashAmount: declaredCents / 100,
        supervisor: roleHasPermission(session.role, 'sales:cancel')
          ? { id: session.userId, name: session.name, role: 'MANAGER' }
          : undefined,
        closingNotes: differenceCents === 0 ? undefined : `Diferencia ${differenceCents / 100}`,
      });
      await store.put('shifts', { ...shift, status: 'CLOSED', closedAt: new Date().toISOString(), declaredCents, expectedCents });
      await log(session.name, 'SHIFT_CLOSE',
        differenceCents === 0 ? 'Corte exacto' : `Corte con diferencia de ${differenceCents / 100} pesos`,
        differenceCents === 0 ? 'normal' : 'alert');
      return { expectedCents, differenceCents };
    },

    async sell(
      session: Session,
      lines: { sku: string; quantity: number }[],
      method: PaymentKind,
      tenderedCents: number,
      customerId?: string
    ): Promise<TicketRecord> {
      await requirePermission(session, 'sales:create');
      if (method === 'CREDIT') await requirePermission(session, 'sales:credit');
      const shift = await this.getOpenShift();
      if (!shift) throw new FerreError('La caja está cerrada. Pide que la abran para cobrar.');
      const products = await store.getAll('products');
      const items: TicketItem[] = lines.map((l) => {
        const p = products.find((x) => x.id === l.sku);
        if (!p) throw new FerreError(`No encontramos el producto ${l.sku}.`);
        return { sku: p.id, name: p.name, quantity: l.quantity, unitPriceCents: p.priceCents, unitCostCents: p.costCents };
      });
      const totalCents = items.reduce((s, i) => s + Math.round(i.unitPriceCents * i.quantity), 0);

      if (method === 'CREDIT') {
        if (!customerId) throw new FerreError('Elige al cliente para la venta a crédito.');
        const customer = (await store.getAll('customers')).find((c) => c.id === customerId && c.active);
        if (!customer) throw new FerreError('Cliente no encontrado.');
        const available = customer.creditLimitCents - customer.creditUsedCents;
        if (totalCents > available) {
          throw new FerreError(`El cliente solo tiene ${available / 100} pesos de crédito disponible.`);
        }
        for (const item of items) {
          const av = await core.inventory.getStockAvailability({ itemId: item.sku, warehouseId: WAREHOUSE });
          if (av.totalAvailable < item.quantity) {
            throw new FerreError('No hay suficiente existencia de uno de los productos.');
          }
        }
        const orderId = generateId('ord');
        const { order } = await core.orders.createOrder({
          id: orderId, idempotencyKey: generateId('cred-ord'), currency: 'MXN', channel: 'POS',
          metadata: { cashierId: session.userId, customerId: customer.id },
        });
        for (const item of items) {
          await core.orders.addLine({
            orderId: order.id,
            line: { lineId: generateId('line'), productId: item.sku, sku: item.sku, name: item.name, quantity: item.quantity, unitPriceCents: item.unitPriceCents },
          });
          await core.inventory.recordStockOut({
            itemId: item.sku, warehouseId: WAREHOUSE, quantity: item.quantity, referenceId: order.id,
            performedBy: { id: session.userId, name: session.name, role: session.role },
            idempotencyKey: `cred:${order.id}:${item.sku}`,
          });
        }
        await core.customers.chargeCredit({
          customerId: customer.id, amountCents: totalCents, referenceId: order.id,
          notes: `Venta a crédito ${order.id}`, performedBy: session.name, idempotencyKey: `chg:${order.id}`,
        });
        await core.orders.transitionStatus({
          orderId: order.id, targetStatus: 'COMPLETED',
          actor: { id: session.userId, name: session.name, role: 'CASHIER' },
        });
        const ticket: TicketRecord = {
          id: order.id, at: new Date().toISOString(), shiftId: shift.id,
          cashierId: session.userId, cashierName: session.name,
          customerId: customer.id, customerName: customer.displayName,
          items, totalCents, method: 'CREDIT', tenderedCents: 0, changeCents: 0, status: 'COMPLETED',
        };
        await store.put('tickets', ticket);
        for (const i of items) await syncStock(i.sku);
        await syncCustomerBalance(customer.id);
        await log(session.name, 'CREDIT_SALE', `Venta a crédito ${ticket.id} a ${customer.displayName} por ${totalCents / 100} pesos`);
        return ticket;
      }

      if (method === 'CASH' && tenderedCents < totalCents) throw new FerreError('El efectivo recibido no alcanza.');
      let result;
      try {
        result = await core.recordCounterSale({
          shiftId: shift.id, warehouseId: WAREHOUSE, cashierId: session.userId, cashierName: session.name,
          idempotencyKey: generateId('sale'),
          items: items.map(({ sku, name, quantity, unitPriceCents }) => ({ sku, name, quantity, unitPriceCents })),
          paymentMethod: CASHIER_PAYMENT_MAP[method],
          tenderedCents: method === 'CASH' ? tenderedCents : totalCents,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.startsWith('Insufficient stock')) throw new FerreError('No hay suficiente existencia de uno de los productos.');
        throw e;
      }
      const ticket: TicketRecord = {
        id: result.orderId, at: new Date().toISOString(), shiftId: shift.id,
        cashierId: session.userId, cashierName: session.name, items, totalCents, method,
        tenderedCents: method === 'CASH' ? tenderedCents : totalCents,
        changeCents: result.change?.toCents() ?? 0, status: 'COMPLETED',
      };
      await store.put('tickets', ticket);
      for (const i of items) await syncStock(i.sku);
      await log(session.name, 'SALE', `Venta ${ticket.id} por ${totalCents / 100} pesos`);
      return ticket;
    },

    /** Void a ticket. Needs the PIN of a supervisor (anti-theft override). */
    async voidTicket(session: Session, ticketId: string, reason: string, supervisorUserId: string, supervisorPin: string): Promise<void> {
      if (reason.trim().length < 4) throw new FerreError('Escribe el motivo de la cancelación.');
      const supervisor = (await store.getAll('staff')).find((s) => s.id === supervisorUserId && s.active);
      const pinOk = supervisor && supervisor.pinHash === (await hashPin(supervisor.id, supervisorPin));
      if (!supervisor || !pinOk || !roleHasPermission(supervisor.roleCode, 'sales:cancel')) {
        await log(session.name, 'DENIED', `Intento de cancelar ${ticketId} sin autorización válida`, 'alert');
        throw new FerreError('Se necesita el PIN correcto del Encargado o del Dueño.');
      }
      const ticket = (await store.getAll('tickets')).find((t) => t.id === ticketId);
      if (!ticket || ticket.status === 'VOIDED') throw new FerreError('Ese ticket no se puede cancelar.');
      for (const i of ticket.items) {
        await core.inventory.recordStockIn({
          itemId: i.sku, warehouseId: WAREHOUSE, quantity: i.quantity,
          unitCost: { amount: i.unitCostCents, currency: 'MXN' },
          performedBy: { id: supervisor.id, name: supervisor.displayName, role: 'MANAGER' },
        });
        await syncStock(i.sku);
      }
      await store.put('tickets', { ...ticket, status: 'VOIDED', voidReason: reason.trim() });
      if (ticket.method === 'CREDIT' && ticket.customerId) {
        await core.customers.recordCreditPayment({
          customerId: ticket.customerId, amountCents: ticket.totalCents, type: 'ADJUSTMENT_CREDIT',
          referenceId: ticket.id, notes: `Cancelación ${ticket.id}`, performedBy: supervisor.displayName,
          idempotencyKey: `void:${ticket.id}`,
        });
        await syncCustomerBalance(ticket.customerId);
      } else if (ticket.method === 'CASH' && ticket.shiftId === (await this.getOpenShift())?.id) {
        await this.cashMovement({ userId: supervisor.id, name: supervisor.displayName, role: supervisor.roleCode }, 'OUT', ticket.totalCents, `Devolución ticket ${ticket.id}`);
      }
      await log(session.name, 'VOID_SALE', `Canceló ${ticket.id} (${ticket.totalCents / 100} pesos). Autorizó ${supervisor.displayName}. Motivo: ${reason.trim()}`, 'alert');
    },

    async createCustomer(session: Session, input: { displayName: string; phone: string; creditLimitCents: number; creditTermDays: number }): Promise<CustomerRecord> {
      await requirePermission(session, 'customers:manage');
      if (input.displayName.trim().length < 2) throw new FerreError('Escribe el nombre del cliente.');
      if (input.creditLimitCents < 0) throw new FerreError('El límite de crédito no puede ser negativo.');
      const rec: CustomerRecord = {
        id: generateId('cust'),
        displayName: input.displayName.trim(),
        phone: input.phone.trim(),
        creditLimitCents: input.creditLimitCents,
        creditUsedCents: 0,
        creditTermDays: Math.max(0, Math.round(input.creditTermDays)),
        active: true,
      };
      await core.customers.createCustomer({
        id: rec.id, displayName: rec.displayName, phone: rec.phone || undefined,
        creditLimitCents: rec.creditLimitCents, creditTermDays: rec.creditTermDays,
      });
      await store.put('customers', rec);
      await log(session.name, 'CUSTOMER_CREATE', `Registró cliente ${rec.displayName} con límite de ${rec.creditLimitCents / 100} pesos`);
      return rec;
    },

    async recordCreditPayment(
      session: Session,
      input: { customerId: string; amountCents: number; method: 'CASH' | 'DEBIT_CARD' | 'BANK_TRANSFER'; notes?: string }
    ): Promise<CreditPaymentRecord> {
      await requirePermission(session, 'customers:credit_payment');
      const shift = await this.getOpenShift();
      if (!shift) throw new FerreError('La caja está cerrada. Ábrela para recibir el abono.');
      const customer = (await store.getAll('customers')).find((c) => c.id === input.customerId && c.active);
      if (!customer) throw new FerreError('Cliente no encontrado.');
      if (!(input.amountCents > 0)) throw new FerreError('Escribe un abono mayor a cero.');
      if (input.amountCents > customer.creditUsedCents) {
        throw new FerreError(`El cliente solo debe ${customer.creditUsedCents / 100} pesos.`);
      }
      const id = generateId('cpay');
      await core.customers.recordCreditPayment({
        customerId: customer.id, amountCents: input.amountCents, type: 'PAYMENT',
        referenceId: id, notes: input.notes?.trim() || 'Abono en caja',
        performedBy: session.name, idempotencyKey: id,
      });
      await core.cashier.recordPayment({
        shiftId: shift.id, transactionReference: id, ticketTotal: input.amountCents / 100,
        concept: `Abono crédito ${customer.displayName}`,
        payments: [{ id: `pmt-${id}`, method: CASHIER_PAYMENT_MAP[input.method], amount: input.amountCents / 100 }],
        tenderedCash: input.method === 'CASH' ? input.amountCents / 100 : undefined,
        idempotencyKey: id,
        performedBy: { id: session.userId, name: session.name, role: 'CASHIER' },
      });
      const rec: CreditPaymentRecord = {
        id, at: new Date().toISOString(), customerId: customer.id, customerName: customer.displayName,
        amountCents: input.amountCents, method: input.method, shiftId: shift.id, byName: session.name, notes: input.notes?.trim(),
      };
      await store.put('creditPayments', rec);
      await syncCustomerBalance(customer.id);
      await log(session.name, 'CREDIT_PAYMENT', `Abono de ${customer.displayName} por ${input.amountCents / 100} pesos`);
      return rec;
    },

    async receivePurchase(session: Session, input: { supplier: string; sku: string; quantity: number; unitCostCents: number }): Promise<PurchaseRecord> {
      await requirePermission(session, 'purchasing:receive');
      const product = (await store.getAll('products')).find((p) => p.id === input.sku);
      if (!product) throw new FerreError('Producto no encontrado.');
      if (!(input.quantity > 0) || input.unitCostCents <= 0) throw new FerreError('Revisa la cantidad y el costo.');
      if (input.supplier.trim().length < 2) throw new FerreError('Escribe el nombre del proveedor.');
      await core.inventory.recordStockIn({
        itemId: product.id, warehouseId: WAREHOUSE, quantity: input.quantity,
        unitCost: { amount: input.unitCostCents, currency: 'MXN' },
        performedBy: { id: session.userId, name: session.name, role: session.role },
      });
      await store.put('products', { ...product, costCents: input.unitCostCents });
      await syncStock(product.id);
      const rec: PurchaseRecord = {
        id: generateId('pur'), at: new Date().toISOString(), supplier: input.supplier.trim(), sku: product.id,
        productName: product.name, quantity: input.quantity, unitCostCents: input.unitCostCents, byName: session.name,
      };
      await store.put('purchases', rec);
      await log(session.name, 'PURCHASE', `Recibió ${input.quantity} ${product.unit} de ${product.name} de ${rec.supplier}`);
      return rec;
    },

    /** Audited stock correction (counted quantity replaces system quantity). */
    async adjustStock(session: Session, sku: string, countedQty: number, reason: string): Promise<void> {
      await requirePermission(session, 'inventory:adjust');
      if (reason.trim().length < 4) throw new FerreError('Escribe el motivo del ajuste.');
      const product = (await store.getAll('products')).find((p) => p.id === sku);
      if (!product || countedQty < 0) throw new FerreError('Revisa el producto y la cantidad.');
      const diff = countedQty - product.stock;
      if (diff === 0) return;
      const actor = { id: session.userId, name: session.name, role: session.role };
      if (diff > 0) {
        await core.inventory.recordStockIn({ itemId: sku, warehouseId: WAREHOUSE, quantity: diff, unitCost: { amount: product.costCents, currency: 'MXN' }, performedBy: actor });
      } else {
        await core.inventory.recordStockOut({ itemId: sku, warehouseId: WAREHOUSE, quantity: -diff, referenceId: `adjust:${reason.trim()}`, performedBy: actor, idempotencyKey: generateId('adj') });
      }
      await syncStock(sku);
      await log(session.name, 'STOCK_ADJUST', `${product.name}: de ${product.stock} a ${countedQty}. Motivo: ${reason.trim()}`, diff < 0 ? 'alert' : 'normal');
    },

    async createProduct(session: Session, input: Omit<ProductRecord, 'stock'>): Promise<void> {
      await requirePermission(session, 'catalog:edit_price');
      if ((await store.getAll('products')).some((p) => p.id === input.id)) throw new FerreError('Ya existe un producto con esa clave.');
      if (input.name.trim().length < 2 || input.priceCents <= 0) throw new FerreError('Revisa el nombre y el precio.');
      const p: ProductRecord = { ...input, stock: 0 };
      await store.put('products', p);
      await loadProductIntoCore(p);
      await log(session.name, 'PRODUCT_CREATE', `Nuevo producto ${p.name}`);
    },
  };
}

export type Ferre = Awaited<ReturnType<typeof createFerre>>;

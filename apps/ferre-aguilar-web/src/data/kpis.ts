import type { AuditRecord, ProductRecord, TicketRecord } from './types';

export interface Kpis {
  salesCents: number;
  ticketCount: number;
  avgTicketCents: number;
  grossProfitCents: number;
  voidedCount: number;
  voidedCents: number;
  lowStock: ProductRecord[];
  topProducts: { name: string; quantity: number; revenueCents: number }[];
  alerts: AuditRecord[];
}

export function isSameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

/** Read-model for the owner's dashboard. Money stays in integer cents. */
export function computeKpis(tickets: TicketRecord[], products: ProductRecord[], audit: AuditRecord[], day: Date): Kpis {
  const today = tickets.filter((t) => isSameLocalDay(t.at, day));
  const done = today.filter((t) => t.status === 'COMPLETED');
  const voided = today.filter((t) => t.status === 'VOIDED');
  const salesCents = done.reduce((s, t) => s + t.totalCents, 0);
  let cost = 0;
  const byProduct = new Map<string, { name: string; quantity: number; revenueCents: number }>();
  for (const t of done) {
    for (const i of t.items) {
      cost += Math.round(i.unitCostCents * i.quantity);
      const prev = byProduct.get(i.sku) ?? { name: i.name, quantity: 0, revenueCents: 0 };
      prev.quantity += i.quantity;
      prev.revenueCents += Math.round(i.unitPriceCents * i.quantity);
      byProduct.set(i.sku, prev);
    }
  }
  return {
    salesCents,
    ticketCount: done.length,
    avgTicketCents: done.length === 0 ? 0 : Math.round(salesCents / done.length),
    grossProfitCents: salesCents - cost,
    voidedCount: voided.length,
    voidedCents: voided.reduce((s, t) => s + t.totalCents, 0),
    lowStock: products.filter((p) => p.stock <= p.minStock),
    topProducts: [...byProduct.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5),
    alerts: audit.filter((a) => a.risk === 'alert' && isSameLocalDay(a.at, day)),
  };
}

export const mxn = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

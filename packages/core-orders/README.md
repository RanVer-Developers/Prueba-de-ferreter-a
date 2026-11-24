# `@modulos/core-orders`

Módulo agnóstico (headless) de dominio puro en TypeScript estricto para gestión comercial híbrida de órdenes (POS, E-commerce, App, B2B).

## Características Principales

- **Aritmética Monetaria Exacta:** Operación en unidades menores enteras (centavos) bajo ISO 4217, redondeo bancario (`ROUND_HALF_EVEN`) y prorrateo exacto por método de Hamilton (`apportionByWeights`).
- **Motor de Impuestos y Descuentos:** Soporte para impuestos `INCLUSIVE` y `EXCLUSIVE`, múltiples tasas por línea, descuentos porcentuales/fijos por línea y globales, y catálogo de cupones validado (`ICouponCatalog`).
- **Validación y Versionado con Zod:** Esquemas Zod en fronteras de entrada y rehidratación de snapshots (`schemaVersion: 1`).
- **Máquina de Estados Parametrizable:** Flujo completo (`DRAFT`, `PENDING`, `IN_PROGRESS`, `READY`, `COMPLETED`, `CANCELLED`, `REFUNDED`) configurable por `OrderTier` (`BASIC`, `INTERMEDIATE`, `ADVANCED`) o `OrderFeatureFlags`.
- **Resiliencia Offline y Concurrencia:** Claves de idempotencia (`idempotencyKey` + `processedOperationKeys`), control de concurrencia optimista (`ConcurrencyError`) y emisión de eventos de dominio.

## Perfiles (`OrderTier`) y Feature Flags

| Feature | `BASIC` | `INTERMEDIATE` | `ADVANCED` |
| :--- | :---: | :---: | :---: |
| `lineDiscounts` | ❌ | ✅ | ✅ |
| `orderDiscounts` | ❌ | ✅ | ✅ |
| `coupons` | ❌ | ❌ | ✅ |
| `inclusiveTaxes` | ✅ | ✅ | ✅ |
| `multipleTaxesPerLine` | ❌ | ✅ | ✅ |
| `workflowStates` | ❌ | ✅ | ✅ |
| `fractionalQuantities` | ❌ | ❌ | ✅ |
| `refunds` | ❌ | ✅ | ✅ |
| `offlineIdempotency` | ✅ | ✅ | ✅ |
| `optimisticConcurrency` | ✅ | ✅ | ✅ |
| `auditTrail` | ❌ | ✅ | ✅ |

## Ejemplo de Uso

```ts
import {
  CreateOrderUseCase,
  InMemoryOrderRepository,
  TransitionOrderStatusUseCase,
} from '@modulos/core-orders';

const orderRepo = new InMemoryOrderRepository({ isolate: true });
const createOrder = new CreateOrderUseCase(orderRepo);
const transitionStatus = new TransitionOrderStatusUseCase(orderRepo);

const { order, summary } = await createOrder.execute({
  id: 'ord-001',
  channel: 'POS',
  currency: 'MXN',
  lines: [
    {
      lineId: 'line-1',
      productId: 'sku-cafe',
      name: 'Café Americano',
      quantity: 2,
      unitPriceCents: 4500,
      taxes: [{ id: 'iva', code: 'IVA', name: 'IVA 16%', ratePercent: 16, mode: 'INCLUSIVE' }],
    },
  ],
});

console.log(summary.total.toString()); // "90.00 MXN"

await transitionStatus.execute({
  orderId: order.id,
  targetStatus: 'COMPLETED',
  actor: { id: 'cashier-1', name: 'Ana' },
});
```

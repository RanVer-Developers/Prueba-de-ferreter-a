# @modulos/core-cashier

Módulo agnóstico de **lógica de dominio pura** (DDD / Clean Architecture) en **TypeScript puro** para la gestión integral de cajas registradoras, turnos de cajeros, movimientos de efectivo, cobros multimoneda/multimétodo, arqueos y conciliación contable.

Diseñado para reutilizarse como bloque de construcción fundamental en retail, gastronomía, farmacias, comercio fronterizo y sistemas POS multidispositivo (web, desktop, mobile y backend).

---

## 🚀 Capacidades Empresariales

- **100% TypeScript Puro & Agnóstico**: Cero dependencias de frameworks o bases de datos. Funciona en Node.js, navegadores, React, React Native, Electron, NestJS, Express, etc.
- **Aritmética Monetaria Exacta (`Money`)**: Almacenamiento en unidades enteras menores (centavos) para erradicar errores de redondeo de coma flotante. Soporte de decimales por divisa según **ISO 4217** (ej. JPY = 0, KWD = 3, USD/EUR/MXN = 2) y reparto proporcional sin pérdida de centavos (`Money.allocate`).
- **Gestión de Vuelto en Pagos Mixtos (Split Payment)**:
  - Derivación automática del efectivo requerido: $\text{Efectivo Requerido} = \text{Total Ticket} - \sum(\text{Otros Métodos})$.
  - Cálculo automático del vuelto: $\text{Vuelto} = \text{Efectivo Recibido} - \text{Efectivo Requerido}$.
- **Algoritmo de Cambio Óptimo (`CashBreakdown.calculateOptimalChange`)**:
  - Resuelve el problema del cambio fraccionario (Bounded Coin Change con existencias físicas limitadas) minimizando piezas entregadas.
  - Previene cobros si la gaveta no dispone de billetes o monedas chicas para el cambio exacto (`InsufficientChangeDenominationsError`).
- **Soporte Offline & Idempotencia Real**:
  - Claves de idempotencia (`idempotencyKey`): reintentos de red devuelven el resultado original (`isReplay: true`) sin duplicar movimientos, saldos ni inventario de billetes.
  - Secuencia monótona estricta (`sequenceNumber`) para correlación de transacciones sincronizadas en lote.
- **Políticas de Autorización Pluggable y Control Interno**:
  - `IAuthorizationPolicy` y `SupervisorAuthorizationPolicy`: validación estricta de roles (`CASHIER`, `SUPERVISOR`, `MANAGER`, `ADMIN`).
  - **Prohibición de autoaprobación (`SelfApprovalNotAllowedError`)**: ningún cajero puede aprobar sus propias anulaciones, reembolsos o cierres forzados.
  - Verificación de firma digital/token del supervisor (`ISignatureVerifier`, `buildReconciliationSignaturePayload`).
- **Reembolsos Ligados a la Venta Original (`RecordRefundUseCase`)**:
  - Vinculación obligatoria por `referenceId`: tope estricto al monto cobrado en la venta original (`RefundExceedsOriginalSaleError`).
  - Antifraude por medio de pago: no permite devolver en efectivo ventas cobradas con tarjeta si se activa la regla.
- **Propinas y Gastos Menores Tipificados**:
  - Registro contable independiente de propinas recaudadas (`TIP`) y liquidadas al personal (`TIP_PAYOUT`), sin mezclar con ingresos comerciales de ventas.
  - Gastos menores categorizados (`CLEANING_SUPPLIES`, `COURIER_SHIPPING`, `STORE_SUPPLIES`, `EMERGENCY_PURCHASE`, etc.) con datos de factura fiscal y proveedor.
- **Ciclo de Vida de Caja & Relevos Continuos (`HandoverShiftUseCase`)**:
  - Estados: `OPEN`, `SUSPENDED` (colación/almuerzo), `LOCKED` (bloqueo de terminal), `CLOSED`.
  - Cierre permitido en turnos `LOCKED` para evitar atascos de terminales abandonadas.
  - Relevo de cajeros en la misma sesión continua con conciliación intermedia.
  - Traspaso de fondo fijo retenido (`retainedFloat`) al turno siguiente de la caja registradora.
- **Arqueo Ciego Total (Blind Count Seguro)**:
  - Vista del cajero `toCashierView()` que oculta el saldo esperado y las diferencias en conteos ciegos, evitando filtraciones de auditoría.
- **Auditoría Fiscal: Cortes X y Z (`GenerateAuditReportUseCase`)**:
  - Lectura informativa parcial (Reporte X) y corte final inmutable (Reporte Z) sellado y numerado consecutivamente por caja (`reportNumber`).
- **Formateador ESC/POS para Impresoras Térmicas (`EscPosTicketFormatter`)**:
  - Salida alineada para 58mm (32 col) y 80mm (42/48 col) en texto plano monoespaciado.
  - Salida binaria `Uint8Array` con codificación CP858 para acentos/ñ/¡/¿ y secuencias exactas de apertura de cajón (`1b 70 00 19 fa`) y corte.
- **Rehidratación Completa y Concurrencia Optimista**:
  - Métodos estáticos `CashShift.fromJSON()` y `CashShift.fromSnapshot()` para round-trip lossless hacia cualquier motor de base de datos (Postgres, SQLite, IndexedDB, etc.).
  - Control de versión (`version`, `persistedVersion`, `ConcurrencyError`) para sincronización multi-terminal y prevención de sobreescrituras concurrentes.

---

## 📦 Instalación

```bash
pnpm add @modulos/core-cashier
```

---

## 🛠️ Ejemplos de Uso

### 1. Cobro Mixto con Derivación de Efectivo y Vuelto

```typescript
import { RecordPaymentUseCase, PaymentMethod } from '@modulos/core-cashier';

const paymentUseCase = new RecordPaymentUseCase(shiftRepo);

// Ticket de $300: cliente paga $200 con tarjeta y entrega billete de $500 en efectivo.
// El core calcula automáticamente: efectivo requerido = $100, vuelto = $400.
const cobro = await paymentUseCase.execute({
  shiftId: 'shift-01',
  transactionReference: 'TK-1002',
  ticketTotal: 300,
  payments: [
    { id: 'p-card', method: PaymentMethod.CREDIT_CARD, amount: 200 },
  ],
  tenderedCash: 500,
  idempotencyKey: 'client-tx-uuid-001',
  performedBy: { id: 'usr-1', name: 'Laura Gómez', role: 'CASHIER' },
});

console.log('Efectivo requerido:', cobro.cashRequired.toString()); // "100.00 USD"
console.log('Vuelto a entregar:', cobro.changeGiven.toString());     // "400.00 USD"
```

---

### 2. Anulación de Venta con Validación de Supervisor

```typescript
import { VoidPaymentUseCase } from '@modulos/core-cashier';

const voidUseCase = new VoidPaymentUseCase(shiftRepo);

// Falla si el cajero intenta autorizarse a sí mismo (SelfApprovalNotAllowedError)
// Requiere la aprobación de un usuario con rol SUPERVISOR o MANAGER
const voidMov = await voidUseCase.execute({
  shiftId: 'shift-01',
  movementIdToVoid: 'mov-1002',
  reason: 'Error en producto marcado',
  authorizedBy: { id: 'sup-1', name: 'Carlos Gerente', role: 'SUPERVISOR' },
});
```

---

### 3. Reembolso con Tope Contable y Antifraude

```typescript
import { RecordRefundUseCase, PaymentMethod } from '@modulos/core-cashier';

const refundUseCase = new RecordRefundUseCase(shiftRepo);

// Si la venta original fue de $100, el core bloquea cualquier intento de devolver > $100
// y previene devolver en efectivo compras realizadas con tarjeta
const refund = await refundUseCase.execute({
  movementId: 'ref-01',
  shiftId: 'shift-01',
  amount: 100,
  paymentMethod: PaymentMethod.CREDIT_CARD,
  referenceId: 'TK-1002',
  disallowCrossMethodRefund: true,
  concept: 'Garantía de satisfacción cliente',
  performedBy: { id: 'usr-1', name: 'Laura Gómez' },
});
```

---

### 4. Formateo de Tickets para Impresora Térmica (ESC/POS)

```typescript
import { EscPosTicketFormatter } from '@modulos/core-cashier';

const formatter = new EscPosTicketFormatter({
  columnWidth: 42,
  storeName: 'MI NEGOCIO S.A.',
  openCashDrawer: true,
  cutPaper: true,
});

// Bytes binarios listos para escribir a puerto USB, serie o socket TCP
const bytes = formatter.getOpenDrawerCommandBytes(); // [0x1b, 0x70, 0x00, 0x19, 0xfa]
const ticketBytes = formatter.formatPaymentReceiptEscPosBytes(cobro, 'TK-1002', 'Laura Gómez');
```

---

## 🧪 Pruebas Unitarias

```bash
pnpm test
```

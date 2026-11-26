# @modulos/core-inventory

Módulo agnóstico de **lógica de dominio pura** (DDD / Clean Architecture) en **TypeScript puro** (cero dependencias externas) para la gestión integral de inventarios, almacenes múltiples, kardex contable de doble partida, métodos de valoración (**FIFO** y **CMP** / Costo Medio Ponderado), trazabilidad por lotes y vencimientos (**FEFO**), números de serie individuales, traslados inter-bodega con stock en tránsito, reservas temporales (apartados con TTL), combos/recetas (**BOM**), arqueos físicos con conteo ciego (**Blind Count**), órdenes de recepción con entregas parciales (**Backorders**), devoluciones (**RMA** de clientes y proveedores), desempaque atómico (**Break-pack**), ensamble de producción ligera, clasificación **ABC de Pareto** para conteos cíclicos, ubicaciones de estantería (**BinLocation**) y formateador de etiquetas **Zebra ZPL / ESC-POS**.

Diseñado para reutilizarse como bloque fundamental en retail, gastronomía, farmacias, e-commerce omnicanal, WMS y sistemas POS multidispositivo (web, desktop, mobile y backend).

---

## 🚀 Capacidades Empresariales

- **100% TypeScript Puro & Agnóstico**: Cero dependencias de frameworks o bases de datos. Funciona en Node.js, navegadores, React, React Native, Electron, NestJS, Express, etc.
- **Aritmética Monetaria y de Cantidades Exacta**:
  - Costos en unidades menores enteras (`Money`) según **ISO 4217** para erradicar errores de redondeo de coma flotante.
  - Cantidades con precisión controlada y conversiones estándar (`Quantity`, `UnitOfMeasure`) entre unidades compatibles (ej. KG a G, L a ML, Docenas a Unidades).
- **Gestión Multi-Bodega & Ubicaciones Lógicas**:
  - Control independiente de saldos por SKU y almacén: **Físico (On-Hand)**, **Reservado (Reserved)**, **Disponible (Available = On-Hand - Reserved)** y **En Tránsito (In-Transit)**.
  - Política de stock negativo configurable (`allowNegativeStock`) bloqueada por defecto (`NegativeStockNotAllowedError`).
- **Kardex Inmutable (Audit Trail / Asientos Contables)**:
  - Registro cronológico inmutable (`StockMovement`) con balance anterior, balance posterior, costo unitario, costo total, usuario ejecutor, supervisor autorizador, referencia comercial y clave de idempotencia.
- **Métodos de Valoración de Inventario**:
  - **FIFO / PEPS (First-In, First-Out)**: Capas contables (`InventoryLayer`) que consumen las entradas más antiguas primero al calcular el costo de venta.
  - **CMP (Costo Medio Ponderado)**: Recálculo ponderado automático con cada recepción de compra sin pérdida de centavos.
  - **Servicio de Valorización (`ValuationService`)**: Valuación en tiempo real por almacén o consolidada a nivel corporativo.
- **Trazabilidad de Lotes y Rotación FEFO (First-Expired, First-Out)**:
  - Prioriza automáticamente el despacho de los lotes más cercanos a vencer para evitar mermas en perecederos y fármacos.
  - Detección de lotes vencidos (`LotExpiredError`), soporte de cuarentena (`QUARANTINED`) y alertas de vencimiento próximo (`getExpiringLots`).
- **Trazabilidad Unitaria por Número de Serie (`SerialNumber`)**:
  - Unicidad garantizada (`DuplicateSerialNumberError`) y control de estados (`IN_STOCK`, `RESERVED`, `SOLD`, `IN_TRANSIT`, `DAMAGED`).
- **Traslados Inter-Bodega con Stock en Tránsito (`StockTransfer`)**:
  - Flujo en dos pasos: Despacho (`DISPATCH` -> descuenta de origen y pasa a `IN_TRANSIT`) y Recepción (`RECEIVE` -> ingresa a destino o marca `DISCREPANCY` auditada).
- **Reservas Temporales con TTL (Apartados y Carritos)**:
  - Apartado temporal de stock sin descontar físico (`reserveStock`), impidiendo sobreventas concurrentes.
  - Confirmación (`commitReservation`) que convierte el apartado en despacho físico al concretarse el cobro.
  - Liberación por expiración automática (`StockReservationService.releaseExpiredReservations`).
- **Órdenes de Recepción y Entregas Parciales (Backorders)**:
  - Seguimiento de entregas (`ReceivingOrder` / `ReceivePurchaseOrderUseCase`): gestiona lo esperado vs. recibido, calcula saldos pendientes de entrega y previene sobredespacho no autorizado (`ReceivingOverdeliveryError`).
- **Devoluciones de Clientes y Proveedores (RMA)**:
  - `RecordCustomerReturnUseCase`: Clasifica el destino del producto devuelto en **Reingreso a estante (`RESTOCK`)**, **Inspección (`QUARANTINE`)** o **Baja inmediata por daño (`DAMAGED_WRITE_OFF`)**.
  - `RecordSupplierReturnUseCase`: Devolución de lotes o piezas defectuosas a proveedores con descuento formal del Kardex.
- **Desempaque Atómico (Break-Pack / Unbundling) y Ensamble**:
  - `BreakPackUseCase`: Conversión atómica de bultos/cajas (`BOX`) a unidades individuales (`UNIT`), prorrateando el costo unitario con precisión de centavos.
  - `StockTransformationService.assemble`: Ensamble de insumos de receta para dar de alta producto terminado incorporando costos adicionales de producción.
- **Clasificación ABC de Pareto y Conteos Cíclicos**:
  - `ABCClassificationService`: Clasificación 80/15/5 según valor económico acumulado y asignación de frecuencias de conteo recomendadas (30, 90, 180 días).
- **Ubicaciones Físicas de Estantería (`BinLocation`)**:
  - Identificación por Pasillo (*Aisle*), Estante (*Rack*), Balda (*Shelf*), Casillero (*Bin*) y Zona (ej. `FROZEN-A01-R02-S03-B04`).
- **Formateador de Etiquetas con Código de Barras (`BarcodeLabelFormatter`)**:
  - Generación de comandos **Zebra ZPL** (Code 128, EAN-13, precios, lotes, ubicaciones) y texto térmico **ESC/POS** para impresoras de góndola.
- **Toma Física y Arqueo Ciego (`InventoryCount` / Blind Count)**:
  - Vista del operador (`toOperatorView()`) que oculta existencias teóricas y diferencias en conteos ciegos para auditorías imparciales.
  - Reconciliación automática con generación de ajustes auditados.
  - **Prohibición de autoaprobación (`SelfApprovalNotAllowedError`)**: El operador que realiza el conteo no puede autoaprobar las discrepancias.
- **Idempotencia Offline & Concurrencia Optimista**:
  - Claves de idempotencia (`idempotencyKey`) en recepciones, salidas y ajustes para reintentos transparentes en apps móviles.
  - Control de versión (`version`, `ConcurrencyError`) y serialización lossless (`toJSON()`, `fromJSON()`).

---

## 📦 Instalación

```bash
pnpm add @modulos/core-inventory
```

---

## 🛠️ Ejemplos de Uso

### 1. Entrada de Mercancía con Costo Contable (CMP)

```typescript
import {
  RecordStockInUseCase,
  InMemoryInventoryRepository,
  InMemoryWarehouseRepository,
  InMemoryStockMovementRepository,
} from '@modulos/core-inventory';

const inUseCase = new RecordStockInUseCase(itemRepo, warehouseRepo, movementRepo);

const result = await inUseCase.execute({
  itemId: 'item-coffee-01',
  warehouseId: 'WH-CENTRAL',
  quantity: 100,
  unitCost: { amount: 15.5, currency: 'USD' },
  referenceId: 'OC-10025',
  performedBy: { id: 'usr-1', name: 'Laura Gómez', role: 'WAREHOUSE_OPERATOR' },
  idempotencyKey: 'tx-po-10025',
});

console.log('Stock disponible:', result.movement.balanceAfter); // 100
console.log('Es reintento:', result.isReplay);                // false
```

---

### 2. Despacho por Venta con Rotación FEFO Automática

```typescript
import { RecordStockOutUseCase } from '@modulos/core-inventory';

const outUseCase = new RecordStockOutUseCase(itemRepo, warehouseRepo, movementRepo);

// Si el producto maneja lotes, el core despacha automáticamente del lote que vence más pronto
const out = await outUseCase.execute({
  itemId: 'item-milk-1l',
  warehouseId: 'WH-STORE-01',
  quantity: 12,
  referenceId: 'TICKET-9941',
  performedBy: { id: 'usr-2', name: 'Carlos Cajero' },
});

console.log('Costo de venta computado:', out.totalCost.toString()); // ej. "18.00 USD"
console.log('Lote consumido (FEFO):', out.movement.lotNumber);
```

---

### 3. Recepción Parcial de Órdenes de Compra (Backorders)

```typescript
import { ReceivePurchaseOrderUseCase } from '@modulos/core-inventory';

const receiveUseCase = new ReceivePurchaseOrderUseCase(orderRepo, itemRepo, warehouseRepo, movementRepo);

// Si la orden esperaba 100 unidades y llegan 40:
const res = await receiveUseCase.execute({
  orderId: 'RO-1001',
  itemId: 'item-coffee-01',
  quantity: 40,
  performedBy: { id: 'usr-wh', name: 'Receptor de Muelle' },
});

console.log('Estado de la orden:', res.order.status);              // "PARTIALLY_RECEIVED"
console.log('Saldo pendiente de recibir:', res.pendingQuantityForThisItem); // 60
console.log('¿Completada totalmente?:', res.isOrderCompleted);     // false
```

---

### 4. Desempaque Atómico (Break-Pack de Cajas a Unidades)

```typescript
import { BreakPackUseCase } from '@modulos/core-inventory';

const breakPackUseCase = new BreakPackUseCase(itemRepo, warehouseRepo, movementRepo);

// Desempacar 2 cajas de 24 latas en 48 latas individuales
const resultado = await breakPackUseCase.execute({
  warehouseId: 'WH-CENTRAL',
  parentItemId: 'item-beer-box24',
  parentQuantityToBreak: 2,
  childItemId: 'item-beer-can',
  unitsPerPack: 24,
  performedBy: { id: 'usr-wh', name: 'Bodeguero' },
});

console.log('Latas individuales creadas:', resultado.totalChildUnitsCreated); // 48
console.log('Costo unitario prorrateado:', resultado.childUnitCost.toString()); // "1.00 USD"
```

---

### 5. Generación de Etiquetas con Código de Barras (Zebra ZPL)

```typescript
import { BarcodeLabelFormatter } from '@modulos/core-inventory';

const labelFormatter = new BarcodeLabelFormatter({ labelWidthMm: 50, labelHeightMm: 30 });

const zplCommands = labelFormatter.formatZpl({
  sku: 'SKU-COFFEE-1KG',
  barcode: '7791234567890',
  name: 'Café Grano Colombia 1kg',
  priceFormatted: '$15.50 USD',
  binLocation: 'PAS-02-E01',
  lotNumber: 'LOT-2026A',
  companyName: 'MI TIENDA S.A.',
});

// Comandos listos para enviar a puerto serie, USB o socket TCP de impresora Zebra
console.log(zplCommands);
```

---

## 🧪 Pruebas Unitarias

```bash
pnpm --filter @modulos/core-inventory test
```

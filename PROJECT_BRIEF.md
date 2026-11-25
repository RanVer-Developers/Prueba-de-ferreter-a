# PROJECT_BRIEF.md — Ficha de Proyecto

> Completar este documento antes de escribir código. Sirve para alinear al cliente, Producto y Desarrollo.

## 1. Datos del Cliente y Negocio
- **Nombre del negocio:** Ferre Alfredo
- **Giro:** Ferretería (alto volumen de clientes en mostrador)
- **Ciudad:** *(Por definir si aplica)*
- **Contacto principal:** Dueño / Administración de Ferre Alfredo
- **Cómo llevan el control hoy:** Sistema `eleventa`

## 2. Problema Principal a Resolver
- Agilizar la atención en mostrador para muchos clientes sin sacrificar el control total del negocio (caja, inventario, compras e indicadores), evitando robos o mermas mediante permisos estrictos por puesto y registro de movimientos, y tolerando intermitencias de internet.

## 3. Alcance del MVP (Versión 1 — Precio de entrada)
*Regla: Solo lo indispensable para que el cliente empiece a usar la app y vea valor rápido.*
- [x] **Venta a mostrador ultrarrápida:** Búsqueda ágil de productos, atajos de teclado, cobro rápido y experiencia amigable para empleados acostumbrados a `eleventa`.
- [x] **Caja y Control de Efectivo:** Apertura/corte de caja, registro de entradas/salidas, control estricto de cancelaciones, descuentos y diferencias.
- [x] **Control de Inventarios y Compras a Proveedores:** Catálogo de productos, registro de compras para surtir stock, alertas de stock bajo y ajustes auditados por bodeguero/encargado.
- [x] **Usuarios, Permisos y Bitácora Anti-Robo:** Roles diferenciados (**Dueño, Encargado, Cajera, Vendedor, Bodeguero, Chofer**) con registro de quién realizó cada acción sensible.
- [x] **Indicadores del Negocio (Tablero):** Ventas del día/mes, utilidad estimada, productos más vendidos, cortes de caja y alertas de inventario.
- [x] **Clientes y Ventas a Crédito:** Directorio de clientes, límite de crédito, bloqueo por morosidad, cobro a crédito en mostrador y registro de abonos.
- [x] **Modo Local / Offline-First:** Operación continua aunque haya intermitencia de internet (almacenamiento local en V1).

## 4. Módulos Opcionales / Crecimiento Futuro (Versión 2 / Upsells)
- [ ] **Sincronización en la nube con Firebase:** Conexión en tiempo real a Firebase (Auth + Firestore) manteniendo compatibilidad con trabajo sin internet.
- [ ] **Unidades de Transporte, Repartos y Mantenimiento:** Asignación de pedidos a camionetas/choferes, seguimiento de entregas y bitácora de mantenimiento de unidades.
- [ ] **Facturación electrónica (CFDI) a clientes**
- [ ] **Multi-sucursal / Reportes avanzados / Notificaciones por WhatsApp**

## 5. Requisitos Técnicos y Módulos Reutilizables
- **Plataformas objetivo:** [x] Web / PWA  [ ] Android  [ ] iOS  [ ] Escritorio
- **¿Requiere funcionar sin internet (Offline-first)?** Sí (intermitencia de internet)
- **Módulos del monorepo RanVer a reutilizar:**
  - `@modulos/core-shared` (aritmética `Money`, `ROUND_HALF_EVEN`, esquemas Zod base)
  - `@modulos/core-auth-rbac` (PIN, roles `Dueño, Encargado, Cajera, Vendedor, Bodeguero, Chofer`, RBAC y aprobación de supervisor)
  - `@modulos/core-catalog` (catálogo, categorías, códigos de barras y listas de precios)
  - `@modulos/core-inventory` (existencias, kardex inmutable, alertas de stock bajo y ajustes auditados)
  - `@modulos/core-purchasing` (proveedores, órdenes de compra, recepción de mercancía y actualización de costos)
  - `@modulos/core-cashier` (turnos, cobros en mostrador, cambio, gastos, anulaciones auditadas, cortes X/Z e idempotencia offline)
  - `@modulos/core-orders` (órdenes rápidas de mostrador y órdenes en espera)
  - `@modulos/core-reports` (indicadores del negocio, utilidad, clasificación ABC y exportación)
  - `@modulos/core-customers` (clientes, límite de crédito, abonos y antigüedad de saldos)

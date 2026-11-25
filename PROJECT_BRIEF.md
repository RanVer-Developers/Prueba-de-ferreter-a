# PROJECT_BRIEF.md — Ficha de Proyecto

> Completar este documento antes de escribir código. Sirve para alinear al cliente, Producto y Desarrollo.

## 1. Datos del Cliente y Negocio
- **Nombre del negocio:** Ferre Aguilar
- **Giro:** Ferretería (venta a mostrador y reparto a domicilio)
- **Tienda:** Única tienda física (varias PCs en mostrador/bodega/administración)
- **Contacto principal:** Dueño / Administración de Ferre Aguilar
- **Cómo llevan el control hoy:** Sistema `eleventa`

## 2. Problema Principal a Resolver
- Modernizar la operación de la ferretería manteniendo la rapidez de atención en mostrador a la que ya están acostumbrados con `eleventa`, pero sumando control total anti-robo (permisos estrictos por puesto y registro de cada acción sensible), control de inventario y compras, seguimiento de unidades de transporte y su mantenimiento, e indicadores claros del negocio, todo operando sin depender de internet.

## 3. Alcance del MVP (Versión 1 — Precio de entrada)
*Regla: Solo lo indispensable para que el cliente empiece a usar la app y vea valor rápido.*
- [x] **Venta a mostrador rápida:** Búsqueda ágil por nombre o código de barras, atajos de teclado, cuentas en espera y cobro ágil pensado para usuarios de `eleventa`.
- [x] **Caja y control de efectivo:** Apertura y corte de turno, conteo de efectivo, entradas/salidas, cancelaciones y descuentos controlados.
- [x] **Control de inventarios:** Catálogo de productos, existencias en tiempo real, kardex de movimientos, alertas de stock bajo y ajustes auditados.
- [x] **Compras a proveedores:** Registro de proveedores, órdenes/recepciones de compra, entrada directa a inventario y actualización de costos.
- [x] **Unidades de transporte y repartos:** Registro de camionetas/unidades, asignación de pedidos a choferes, seguimiento de entregas y confirmación de reparto.
- [x] **Mantenimiento de unidades:** Historial de servicios, reparaciones, refacciones y alertas/seguimiento de mantenimiento por unidad.
- [x] **Usuarios, permisos y bitácora anti-robo:** Roles diferenciados (**Dueño, Encargado, Cajera, Vendedor, Bodeguero, Chofer**) con permisos estrictos y registro de quién realiza cada movimiento sensible.
- [x] **Indicadores del negocio:** Tablero con ventas del día/mes, utilidad estimada, productos más vendidos, cortes de caja y alertas de stock o mantenimiento.
- [x] **Operación local sin internet (multi-PC en tienda):** Funcionamiento continuo sin conexión, permitiendo operar desde varias computadoras dentro de la tienda.

## 4. Módulos Opcionales / Crecimiento Futuro (Versión 2 / Upsells)
- [ ] **Facturación electrónica (CFDI) a clientes** (por ahora el negocio no factura a sus clientes).
- [ ] **Sincronización en la nube:** Respaldo y sincronización remota (ej. Firebase) para consultar desde fuera de la tienda o conectar sucursales futuras.
- [ ] **Multi-sucursal:** Administración centralizada de varias tiendas.
- [ ] **Notificaciones automáticas por WhatsApp:** Avisos de pedido en camino o entregas al cliente.

## 5. Requisitos Técnicos y Módulos Reutilizables
- **Plataformas objetivo:** [x] Web / PWA  [ ] Android  [ ] iOS  [ ] Escritorio
- **¿Requiere funcionar sin internet (Offline-first)?** Sí (los datos viven en local y debe operar sin internet entre varias PCs de la tienda).
- **Módulos del monorepo RanVer (`@modulos/*`) a reutilizar:**
  - `@modulos/core-shared`: Aritmética monetaria exacta en centavos (`Money`) y esquemas base.
  - `@modulos/core-settings`: Configuración general de Ferre Aguilar y su tienda única (`BASIC`).
  - `@modulos/core-auth-rbac`: Acceso por usuario/PIN, roles (`Dueño`, `Encargado`, `Cajera`, `Vendedor`, `Bodeguero`, `Chofer`), permisos granulares, autorización de supervisor y bitácora anti-robo (`INTERMEDIATE`).
  - `@modulos/core-catalog`: Productos, categorías, códigos de barras y listas de precios (`BASIC`/`INTERMEDIATE`).
  - `@modulos/core-inventory`: Existencias, kardex inmutable, alertas de stock bajo y recepciones (`INTERMEDIATE`).
  - `@modulos/core-purchasing`: Proveedores, compras, recepciones y actualización de costos (`INTERMEDIATE`).
  - `@modulos/core-orders`: Venta rápida en mostrador, cuentas en espera y devoluciones (`INTERMEDIATE`).
  - `@modulos/core-cashier`: Cajas, turnos, pagos mixtos, conteo por denominación, gastos y cortes (`INTERMEDIATE`).
  - `@modulos/core-logistics`: Envíos, asignación a choferes/unidades, rutas y prueba de entrega (`INTERMEDIATE`).
  - `@modulos/core-services`: Órdenes de mantenimiento de unidades de transporte, diagnóstico y refacciones (`BASIC`/`INTERMEDIATE`).
  - `@modulos/core-reports`: Indicadores de ventas, utilidad/margen, comparativas y exportación (`INTERMEDIATE`).

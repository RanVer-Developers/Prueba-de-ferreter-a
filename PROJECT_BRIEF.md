# PROJECT_BRIEF.md — Ficha de Proyecto

> Completar este documento antes de escribir código. Sirve para alinear al cliente, Producto y Desarrollo.

## 1. Datos del Cliente y Negocio
- **Nombre del negocio:** Ferretería y Materiales El Tornillo Fuerte
- **Giro:** Ferretería, tlapalería y materiales básicos de construcción (tornillería suelta, herramientas manuales y eléctricas, plomería, material eléctrico, cemento, varilla, arena, pintura).
- **Ciudad:** Por confirmar
- **Contacto principal:** Dueño / Encargado General
- **Cómo llevan el control hoy:** Notas de remisión en papel, un archivo Excel desactualizado y pedidos/cotizaciones por WhatsApp.

## 2. Problema Principal a Resolver
- Fugas y descontrol de inventario por miles de piezas chicas (clavos, tuercas, codos, cinta) y venta fraccionada (pieza, metro, kilo, caja cerrada).
- Errores de precios y equivalencias al comprar por caja/rollo y vender suelto en mostrador.
- Cotizaciones y pedidos por WhatsApp que se pierden sin saber cuáles se cobraron, cuáles siguen pendientes o qué material está apartado.
- Descontrol de créditos (fiado a 15/30 días) en libreta y falta de visibilidad sobre qué pedidos pagados faltan por entregar en bodega o patio.

## 3. Alcance del MVP (Versión 1 — Precio de entrada)
*Regla: Solo lo indispensable para que el cliente empiece a usar la app y vea valor rápido.*
- [x] **Mostrador, Catálogo y Cotizaciones:**
  - Buscador ultrarrápido (< 5 seg) por nombre común, apodo o medida, mostrando precio público, mayoreo, stock disponible y pasillo/estante.
  - Manejo de unidades y equivalencias (pieza, metro, kilo, caja cerrada) con conversión automática de precio y descuento exacto de inventario (`breakPack` / cantidades fraccionarias).
  - Cotizaciones rápidas con resumen limpio para copiar/enviar por WhatsApp o imprimir, estado "Pendiente", opción de apartar/reservar inventario, conversión a venta en 1 clic y botón para recalcular precios al día de hoy si pasó tiempo.
  - Separación de flujo Mostrador → Caja: el vendedor arma la nota en espera (`parkedOrders`) y el cajero la cobra.
  - Precios de mayoreo/volumen y descuentos pequeños permitidos para vendedor (mayores requieren PIN del dueño).
- [x] **Clientes, Crédito (Fiado) y Entregas en Bodega:**
  - Directorio de clientes frecuentes con límite de crédito autorizado, saldo actual y días de plazo (15/30 días).
  - Bloqueo automático en mostrador si rebasa límite o tiene notas vencidas, requiriendo PIN del dueño para autorizar.
  - Registro de abonos parciales o liquidación de notas específicas de crédito.
  - Indicador de entrega ("Entregado en mostrador" vs "Por entregar") y vista especial para Bodega/Patio con pedidos **pagados o con crédito autorizado** pendientes de cargar o entregar (bloqueando notas sin pago/autorización y evitando entregas duplicadas).
- [x] **Caja y Control Anti-Robo:**
  - Apertura/cierre de turno con fondo inicial, registro de entradas y salidas/gastos menores (gasolina, comida de cargadores) con motivo obligatorio.
  - Arqueo ciego al cerrar turno (el cajero declara lo contado sin ver el esperado).
  - Cancelaciones, devoluciones y cambios de precio protegidos con PIN del Dueño/Encargado.
  - Permisos por puesto fijo (Vendedor, Cajero, Bodega/Patio, Dueño) editables por el Dueño en panel de configuración.
- [x] **Inventario, Compras y Reportes:**
  - Alertas de stock mínimo ("Productos por pedir") y ubicación por pasillo/estante.
  - Bloqueo estricto de venta si el inventario está en cero (solo el dueño con PIN puede autorizar vender sin stock).
  - Entrada rápida de compras a proveedores con actualización automática de costo y aviso si subió el costo para ajustar precio de venta.
  - Conteos rápidos por pasillo/categoría sin cerrar la tienda, reporte diario claro (contado vs crédito, dinero real en caja, más vendidos y sin movimiento) y respaldo/restauración manual en archivo `.json`.

## 4. Módulos Opcionales / Crecimiento Futuro (Servicios con costo extra)
- [ ] Respaldo y sincronización automática en la nube en tiempo real (Firebase / PostgreSQL) entre dispositivos
- [ ] Multi-sucursal
- [ ] Facturación electrónica CFDI 4.0 SAT (`@modulos/fiscal-mx-sat` + `@modulos/core-billing`)
- [ ] Envío automático de mensajes por WhatsApp Business API
- [ ] Soporte remoto prioritario

### Movido a V2 por alcance (acordado en Paso 0)
- Sincronización multi-dispositivo en tiempo real por nube (V1 opera local en dispositivos con respaldo/restauración manual `.json`).

## 5. Requisitos Técnicos y Módulos Reutilizables
- **Plataformas objetivo:** [x] Web / PWA  [x] Android (tablet/celular bodega)  [ ] iOS  [x] Escritorio (computadora mostrador/caja)
- **¿Requiere funcionar sin internet (Offline-first)?** Sí (operación local en dispositivos de la tienda con respaldo manual en archivo `.json`).
- **Módulos del monorepo RanVer (`@modulos/*`) a reutilizar:**
  - `@modulos/core-shared`: Primitivas `Money` en centavos, Zod base e IDs.
  - `@modulos/core-settings` (`BASIC`): Datos de la ferretería y configuración general.
  - `@modulos/core-auth-rbac` (`INTERMEDIATE`): Acceso por PIN, roles (Vendedor, Cajero, Bodega, Dueño), permisos granulares editables y `supervisorOverride` (PIN del dueño).
  - `@modulos/core-catalog` (`INTERMEDIATE` + `volumeTierPricing` de `ADVANCED`): Productos, apodos/códigos múltiples, categorías, listas de precios (público/mayoreo), precios por volumen.
  - `@modulos/core-customers` (`ADVANCED`): Directorio de clientes, crédito/fiado (`creditAccounts`), abonos, antigüedad de saldos y bloqueos por mora (`creditAgingAndHolds`).
  - `@modulos/core-orders` (`ADVANCED`): Carrito, notas en espera (`parkedOrders`), cotizaciones (`quotes`), notas de entrega (`deliveryNotes`), descuentos, devoluciones y `fractionalQuantities` (piezas/metros/kilos).
  - `@modulos/core-cashier` (`ADVANCED`, recordando unidad en pesos): Turnos de caja, gastos categorizados, arqueo ciego (`blindCounts`), firma/PIN de supervisor (`supervisorSignatures`).
  - `@modulos/core-inventory` (`ADVANCED`): Stock en almacén único, kardex, `breakPack` (caja → piezas/metros), alertas de resurtido (`replenishmentSuggestions`), `binLocations` (pasillo/estante), `cycleCounting` (conteos por pasillo) y `negativeStock: false` (bloqueo en cero).
  - `@modulos/core-purchasing` (`BASIC` + `auditTrail`): Entrada rápida de compras sin OC obligatoria (`directPurchaseWithoutPO`) y actualización automática de costo (`autoUpdateCatalogCost`).
  - `@modulos/core-reports` (`INTERMEDIATE`): Resumen diario de ventas, formas de pago, productos más vendidos / sin movimiento y exportación.
  - `@modulos/core-logistics` (`BASIC`): Control básico de entregas pendientes en bodega/patio.
  - `@modulos/erp-bridges`, `@modulos/react-bindings`, `@modulos/cashier-react`: Conexión entre módulos y bindings React.

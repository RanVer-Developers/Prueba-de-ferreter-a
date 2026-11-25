# DATA_SECURITY.md — Datos, Privacidad y Candados de Seguridad

> Completa esto antes de programar. La IA usará estas respuestas para crear los candados reales de tu base de datos y proteger la información.

## 1. ¿Qué información va a guardar la app?
- Catálogo de productos (nombres, apodos/medidas, ubicaciones en pasillo/estante, costos, precios público/mayoreo, equivalencias de caja/rollo a pieza/metro).
- Existencias en inventario, movimientos (kardex), alertas de stock mínimo, conteos por pasillo y entradas de compras a proveedores.
- Clientes frecuentes, saldos de crédito (fiado), límites autorizados, plazos y abonos a notas específicas.
- Cotizaciones pendientes, notas de venta en espera, ventas cobradas, entregas pendientes en bodega/patio y turnos/movimientos de caja.
- Usuarios, puestos, permisos y bitácora de autorizaciones con PIN.

## 2. ¿Quiénes usan la app y qué puede hacer cada quien?
- **Rol 1 (Dueño / Encargado General):** Acceso total. Puede ver utilidades y costos, autorizar con su PIN ventas sin stock, créditos excedidos/vencidos, descuentos mayores, cancelaciones, devoluciones y cambios de precio; editar permisos, usuarios y respaldar/restaurar datos.
- **Rol 2 (Vendedor de Mostrador):** Busca productos, arma cotizaciones, convierte cotizaciones a venta, envía notas en espera a caja y aplica descuentos pequeños dentro del tope permitido. No cancela ventas cobradas ni cambia precios base.
- **Rol 3 (Cajero):** Cobra notas en espera, recibe abonos de crédito, registra apertura/cierre de turno y gastos menores con motivo obligatorio. Hace arqueo ciego al cerrar (no ve el monto esperado antes de declarar).
- **Rol 4 (Encargado de Bodega / Patio):** Consulta únicamente pedidos ya pagados pendientes de surtir/cargar, marca entregas completadas y reporta productos por agotarse o conteos de pasillo.

## 3. Privacidad entre usuarios / negocios
- **¿Un usuario puede ver los datos de otro usuario o negocio?**
  - [ ] No, cada quien solo ve lo suyo (aislamiento estricto).
  - [x] Solo dentro de su misma empresa/equipo (según los permisos de su puesto).
  - [ ] Hay información pública

## 4. Modo de Trabajo e Internet
- **¿Necesita funcionar cuando se va el internet?**
  - [x] Sí, debe funcionar de forma local sin depender de internet.
  - [ ] No, siempre habrá internet.
- **¿Dónde se guardan los datos?**
  - [ ] Firebase (Auth + Firestore) — *(pospuesto para V2)*
  - [ ] PostgreSQL
  - [x] Solo local en el dispositivo (IndexedDB / SQLite local con respaldo y restauración manual en archivo `.json`).

## 5. Acciones Delicadas (Requieren confirmación, PIN de Dueño y registro)
- [x] Borrar clientes, productos o registros históricos
- [x] Cancelar ventas / devolver dinero (PIN de Dueño)
- [x] Cambiar precios o permisos de usuarios (PIN de Dueño)
- [x] Vender un producto con inventario en cero o autorizar crédito excedido/vencido (PIN de Dueño)
- [x] Exportar listas completas / generar respaldo `.json`

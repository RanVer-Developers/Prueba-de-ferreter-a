# DATA_SECURITY.md — Datos, Privacidad y Candados de Seguridad

> Completa esto antes de programar. La IA usará estas respuestas para crear los candados reales de tu base de datos y proteger la información.

## 1. ¿Qué información va a guardar la app?
- Catálogo de productos, códigos de barras, precios de venta, costos de compra y existencias en inventario
- Ventas de mostrador, devoluciones y movimientos de caja (aperturas, entradas, salidas, cortes)
- Proveedores, compras y recepciones de mercancía
- Unidades de transporte, repartos asignados a choferes y su historial de mantenimiento
- Usuarios, roles, permisos y bitácora de auditoría (quién hizo cada acción sensible)
- Indicadores y reportes del negocio

## 2. ¿Quiénes usan la app y qué puede hacer cada quien?
- **Dueño:** Acceso total. Ve indicadores y ganancias, costos, bitácora anti-robo, autoriza acciones sensibles y administra usuarios y permisos.
- **Encargado:** Supervisa la operación diaria de la tienda, autoriza cancelaciones/descuentos, revisa cortes de caja, compras, inventario y repartos (sin cambiar permisos del Dueño).
- **Cajera:** Abre y cierra su caja, cobra ventas en mostrador y registra movimientos de caja autorizados. No puede borrar historial, alterar costos ni ver utilidades globales.
- **Vendedor:** Busca productos, consulta existencias/precios y arma pedidos o notas en mostrador. No puede abrir caja, cancelar ventas cobradas ni cambiar precios.
- **Bodeguero:** Registra entradas por compras a proveedores, consulta inventario y solicita ajustes de stock (todo queda registrado en bitácora). No accede a caja ni reportes financieros.
- **Chofer:** Ve únicamente los pedidos/repartos asignados a su unidad, confirma entregas y reporta incidencias o solicitudes de mantenimiento de su unidad. No accede a caja, costos ni ventas globales.

## 3. Privacidad entre usuarios / negocios
- **¿Un usuario puede ver los datos de otro usuario o negocio?**
  - [ ] No, cada quien solo ve lo suyo (aislamiento estricto).
  - [x] Solo dentro de su misma tienda (Ferre Aguilar), limitado estrictamente por los permisos de su rol.
  - [ ] Hay información pública.

## 4. Modo de Trabajo e Internet
- **¿Necesita funcionar cuando se va el internet?**
  - [x] Sí, debe operar sin internet en todo momento.
  - [ ] No, siempre habrá internet.
- **¿Dónde se guardan los datos?**
  - [x] Local en la tienda (de momento los datos viven en local, permitiendo el acceso de varias PCs dentro de la misma tienda sin depender de internet).
  - [ ] Nube remota (queda para una versión futura si el negocio crece a más sucursales o requiere acceso externo).

## 5. Acciones Delicadas (Requieren confirmación, permiso y registro en bitácora)
- [x] Desactivar productos, usuarios o unidades (sin borrar historial)
- [x] Cancelar ventas, aplicar descuentos especiales o devolver dinero
- [x] Cambiar precios de venta, costos o permisos de usuarios
- [x] Ajustar inventario manualmente (mermas, faltantes o sobrantes)
- [x] Abrir cajón o registrar salidas de efectivo de caja
- [x] Exportar listas de inventario o reportes financieros

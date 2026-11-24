# DATA_SECURITY.md — Datos, Privacidad y Candados de Seguridad

> Completa esto antes de programar. La IA usará estas respuestas para crear los candados reales de tu base de datos y proteger la información.

## 1. ¿Qué información va a guardar la app?
*(Lista simple en lenguaje normal)*
- Catálogo de productos, precios de compra/venta y existencias en inventario
- Ventas de mostrador, devoluciones y movimientos de caja (aperturas, retiros, cortes)
- Compras a proveedores y entradas de mercancía
- Usuarios, roles y bitácora de auditoría (quién hizo cada movimiento sensible)
- Indicadores y reportes del negocio

## 2. ¿Quiénes usan la app y qué puede hacer cada quien?
- **Dueño:** Acceso total. Ve indicadores, ganancias, costos, bitácora anti-robo, aprueba ajustes/cancelaciones, gestiona usuarios y permisos.
- **Encargado:** Supervisa operación diaria, autoriza cancelaciones/descuentos, revisa cortes de caja, compras e inventario (sin modificar permisos del Dueño).
- **Cajera:** Abre y cierra su caja, cobra ventas en mostrador, registra retiros/entradas autorizadas. No puede borrar historial ni ver ganancias globales del negocio.
- **Vendedor:** Arma pedidos/cotizaciones en mostrador y consulta precios y existencias. No puede modificar precios, cancelar ventas ni abrir caja.
- **Bodeguero:** Registra entradas por compras a proveedores, revisa existencias y solicita ajustes de inventario (quedan auditados). No accede a caja ni indicadores financieros.
- **Chofer:** *(Preparado en catálogo de roles para V2: solo verá entregas asignadas y confirmará repartos).*

## 3. Privacidad entre usuarios / negocios
- **¿Un usuario puede ver los datos de otro usuario o negocio?**
  - [ ] No, cada quien solo ve lo suyo (aislamiento estricto).
  - [x] Solo dentro de su misma empresa/equipo (según permisos estrictos de su rol).
  - [ ] Hay información pública (especificar qué):

## 4. Modo de Trabajo e Internet
- **¿Necesita funcionar cuando se va el internet?**
  - [x] Sí, debe seguir funcionando ante intermitencia de internet y sincronizar cuando regrese la señal.
  - [ ] No, siempre habrá internet.
- **¿Dónde se guardan los datos en la nube?**
  - [x] Firebase (Auth + Firestore) — *Conexión planeada para Versión 2; en Versión 1 opera con almacenamiento local persistente en el dispositivo.*
  - [ ] PostgreSQL
  - [ ] Solo local en el dispositivo (sin nube)

## 5. Acciones Delicadas (Requieren confirmación y registro)
*(Marca las que aplican en tu app)*
- [x] Borrar clientes, productos o registros históricos (preferible desactivar en lugar de borrar)
- [x] Cancelar ventas / devolver dinero
- [x] Cambiar precios, costos o permisos de usuarios
- [x] Ajustar inventario manualmente (mermas, faltantes o sobrantes)
- [x] Exportar listas completas de productos o finanzas

# ADR.md — Bitácora de Decisiones Importantes

> Aquí anotamos las decisiones grandes del proyecto y *por qué* se tomaron, para que ni tú ni la IA las cambien por accidente más adelante.

---

## Decisión 1: Plataformas de la Versión 1
- **Fecha:** 2026-11-25
- **¿Qué decidimos?** Construir la Versión 1 como aplicación Web / PWA responsiva (compatible con computadora en caja/mostrador, tablet de mostrador y celular/tablet en bodega/patio, lista para empaquetarse con Capacitor/Tauri si se requiere).
- **¿Por qué?** El equipo trabaja con dispositivos variados (computadora en caja/mostrador y celular/tablet en bodega).

## Decisión 2: Dónde se guardan los datos
- **Fecha:** 2026-11-25
- **¿Qué decidimos?** Operación local sin internet (IndexedDB en navegador / SQLite si se empaqueta nativo) con respaldo y restauración manual en archivo `.json` para validar primero el funcionamiento completo, dejando la sincronización en la nube para después (V2).
- **¿Por qué?** El cliente decidió validar primero la operación completa en modo local antes de conectar la nube.

## Decisión 3: Reglas estrictas de inventario, caja y autorizaciones
- **Fecha:** 2026-11-25
- **¿Qué decidimos?**
  1. Bloquear ventas con inventario en cero salvo autorización con PIN del Dueño.
  2. Arqueo de caja ciego al cierre de turno.
  3. Bloqueo de crédito fiado si supera límite o tiene notas vencidas, salvo PIN del Dueño.
  4. Cotizaciones con opción de apartar inventario (`reservations`) y botón para recalcular precios al día de hoy.
  5. Prohibir entregar en bodega pedidos que no estén pagados o con crédito autorizado.
- **¿Por qué?** Para eliminar fugas de inventario, errores de cobro, entregas dobles o sin pago, y descuadres de caja.

## Decisión 4: Qué NO vamos a construir todavía (V2)
- **Fecha:** 2026-11-25
- **¿Qué decidimos dejar fuera?** Sincronización en tiempo real en la nube (Firebase/PostgreSQL), facturación electrónica SAT CFDI 4.0 y envíos automáticos por WhatsApp Business API.
- **¿Por qué?** Para entregar valor rápido en mostrador, caja, bodega e inventario sin sobrecargar la Versión 1.

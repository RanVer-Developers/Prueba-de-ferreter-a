# ADR.md — Bitácora de Decisiones Importantes

> Aquí anotamos las decisiones grandes del proyecto y *por qué* se tomaron, para que ni tú ni la IA las cambien por accidente más adelante.

---

## Decisión 1: Plataforma y experiencia operativa
- **Fecha:** 2026-11-25
- **¿Qué decidimos?** Aplicación Web / PWA responsiva enfocada principalmente en computadoras de mostrador (teclado y ratón) en la tienda, con soporte para tablet/móvil en bodega o reparto.
- **¿Por qué?** Ferre Aguilar ya opera con `eleventa` en mostrador y necesita que el equipo adopte la nueva herramienta con la misma velocidad, pero con una interfaz sobria, moderna y profesional.

## Decisión 2: Almacenamiento local, operación sin internet y múltiples PCs en tienda
- **Fecha:** 2026-11-25
- **¿Qué decidimos?** Que los datos vivan en local y la app opere sin internet, soportando múltiples computadoras dentro de la única tienda (persistencia local con capacidad de sincronización en red local / almacenamiento compartido en tienda).
- **¿Por qué?** La ferretería no puede detener sus ventas ni su control si falla el internet, y de momento no requiere nube externa.

## Decisión 3: Alcance incluido vs. excluido en esta versión
- **Fecha:** 2026-11-25
- **¿Qué decidimos incluir?** Mostrador, caja, inventario, compras a proveedores, unidades de transporte y repartos, mantenimiento de unidades, indicadores del negocio y control anti-robo con 6 roles (Dueño, Encargado, Cajera, Vendedor, Bodeguero, Chofer).
- **¿Qué decidimos dejar fuera por ahora?**
  1. Facturación electrónica (CFDI) a clientes (el negocio no factura actualmente).
  2. Sincronización en la nube externa y soporte multi-sucursal (quedan para expansión futura).
- **¿Por qué?** Cubrir toda la operación real de Ferre Aguilar sin complicar la puesta en marcha con módulos fiscales o de nube que hoy no necesitan.

# ADR.md — Bitácora de Decisiones Importantes

> Aquí anotamos las decisiones grandes del proyecto y *por qué* se tomaron, para que ni tú ni la IA las cambien por accidente más adelante.

---

## Decisión 1: Plataformas de la Versión 1
- **Fecha:** 2026-11-24
- **¿Qué decidimos?** Aplicación Web / PWA responsiva enfocada en computadora de mostrador (teclado y ratón) y tablet.
- **¿Por qué?** Ferre Alfredo atiende muchos clientes en mostrador y necesita máxima velocidad operativa y facilidad de adopción viniendo de `eleventa`.

## Decisión 2: Dónde se guardan los datos
- **Fecha:** 2026-11-24
- **¿Qué decidimos?** En la Versión 1 se guarda localmente en el dispositivo (modo offline-first ante intermitencia de internet), dejando la estructura lista para conectar a Firebase (Auth + Firestore) en la Versión 2.
- **¿Por qué?** Permite salir rápido a operar sin frenar por la integración en la nube, garantizando que nunca se detenga el cobro si falla el internet.

## Decisión 3: Qué NO vamos a construir todavía
- **Fecha:** 2026-11-24
- **¿Qué decidimos dejar fuera?**
  1. Unidades de transporte, repartos y mantenimiento de unidades (pasa a Versión 2).
  2. Conexión activa a Firebase en la nube (pasa a Versión 2).
  3. Facturación electrónica (CFDI) a clientes.
- **¿Por qué?** Entregar valor rápido en lo más urgente del negocio: velocidad en mostrador, caja, inventario, compras, indicadores y control anti-robo.

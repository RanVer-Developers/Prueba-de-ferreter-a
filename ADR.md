# ADR.md — Bitácora de Decisiones Importantes

> Aquí anotamos las decisiones grandes del proyecto y *por qué* se tomaron, para que ni tú ni la IA las cambien por accidente más adelante.

---

## Decisión 1: Plataformas de la Versión 1
- **Fecha:** 2026-11-19
- **¿Qué decidimos?** Construir el núcleo compartido en TypeScript puro + interfaz React/Tailwind empacada para **Android** (Capacitor con plugin Bluetooth LE para impresora térmica y almacenamiento local SQLite).
- **¿Por qué?** La app se usará directamente en un celular Android en caseta/patio, sin depender de computadora ni internet.

## Decisión 2: Dónde se guardan los datos
- **Fecha:** 2026-11-19
- **¿Qué decidimos?** Almacenamiento 100% local en el dispositivo (SQLite vía `IStorageAdapter`), sin nube en Versión 1, con acceso protegido por PIN del dueño para métricas, cortes y acciones delicadas.
- **¿Por qué?** El negocio requiere operar sin internet en el celular y evitar que la encargada altere o borre registros de cobros.

## Decisión 3: Qué NO vamos a construir todavía
- **Fecha:** 2026-11-19
- **¿Qué decidimos dejar fuera?** Sincronización en la nube, pensiones mensuales, multi-sucursal y reportes contables avanzados quedan para Versión 2 (módulos opcionales).
- **¿Por qué?** Mantener la Versión 1 simple, rápida de probar en operación real y enfocada en entradas, cobro de \$20/hora o fracción, ticket Bluetooth y corte anti-fugas.

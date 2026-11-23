# REVIEW.md — Criterios de Auto-Revisión y Pull Requests

Este documento define qué debe revisar la IA antes de dar por listo un cambio y qué verifica Ingeniería antes de aprobar un Pull Request hacia `dev` o `main`.

---

## 1. Reglas Bloqueantes (No pasa a revisión si falla)
- **Aislamiento de dominio (`.agent/rules/stack-multiplatform.md`):**
  - Los paquetes/carpetas `core-*` o `domain/` no importan React, DOM, Tailwind, Zustand ni SDKs de base de datos o hardware.
- **Tipado estricto:**
  - Cero usos de `any`, `@ts-ignore` o `eslint-disable` sin justificación técnica explícita en comentario.
- **Aritmética monetaria segura:**
  - Montos financieros operados en **enteros mínimos (centavos)** o librería decimal estricta; nunca `number` flotante nativo para dinero.
- **Seguridad y secretos:**
  - Cero API keys, tokens, contraseñas o archivos `.env` / `.env.local` incluidos en el diff.
  - Entradas externas validadas con Zod en fronteras.

---

## 2. Experiencia de Usuario PyME (`DESIGN.md` y `BRAND.md`)
- **Español claro de México:** Todos los textos visibles para el usuario final (botones, etiquetas, mensajes de error y estados vacíos) están en español natural, sin tecnicismos ni errores crudos en inglés.
- **Confirmación en acciones destructivas:** Eliminar registros o cancelar ventas/citas pide confirmación explícita.
- **Accesibilidad y móvil:** Botones principales con área táctil cómoda (`44px+`), contraste legible y diseño funcional en pantalla pequeña/mostrador.
- **Logs de soporte:** Errores inesperados registrados localmente (sin datos sensibles) y accesibles desde *Ayuda / Soporte* para facilitar correcciones en Paso 4.

---

## 3. Límite de Ruido (*Anti-nitpicking*)
- La IA **solo reporta riesgos reales** de arquitectura, datos, seguridad, pruebas faltantes o UX.
- No bloquear ni generar comentarios por preferencias menores de formato si el linter y `typecheck` ya pasan.

---

## 4. Formato de Salida de Auto-Revisión
Al ejecutar la auto-revisión (`pr-checklist`), entrega un resumen breve:
- ✅ **Cumple:** Puntos verificados y comandos que pasaron (`typecheck`, `vitest`, `build`).
- ⚠️ **Bloqueante:** Lista exacta con `archivo:línea` y qué debe corregirse antes de pedir revisión humana.

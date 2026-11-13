---
name: client-brief
description: Convierte notas de reunión, mensajes de WhatsApp o ideas del cliente en un PROJECT_BRIEF.md estructurado, separando el MVP de entrada de los módulos adicionales de pago.
---

# Skill: Client Brief (RanVer Developers)

Usa esta skill cuando el usuario te dé notas desordenadas de una reunión con un cliente, audios transcritos o una idea de negocio para aterrizar un nuevo proyecto.

## Instrucciones
1. Lee las notas proporcionadas por el usuario.
2. Completa o actualiza `PROJECT_BRIEF.md` siguiendo su estructura:
   - **Problema principal:** Resume en 2-3 líneas el dolor real del negocio.
   - **MVP (Versión 1):** Selecciona únicamente las funciones mínimas necesarias para que el cliente deje la libreta/Excel y empiece a operar. Mantén el alcance pequeño y realista.
   - **Módulos Opcionales (Upsells):** Todo lo que sea "sería bonito tener" (nube, multi-sucursal, WhatsApp automático, reportes complejos, soporte remoto) colócalo en la sección de crecimiento futuro.
   - **Módulos Reutilizables:** Sugiere qué entidades de dominio estándar podrían reutilizarse (ej. `customers`, `inventory`, `sales`, `appointments`, `cash-register`).
3. Si falta información crítica (ej. si necesitan trabajar sin internet o en qué dispositivo lo usarán), haz máximo **3 preguntas concretas** al usuario al final.

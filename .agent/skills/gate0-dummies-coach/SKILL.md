---
name: gate0-dummies-coach
description: Guía a usuarios no programadores por el Paso 0 (Pre-Flight) en lenguaje claro y sin tecnicismos antes de escribir cualquier línea de código, asegurando que PROJECT_BRIEF.md, BRAND.md y DATA_SECURITY.md queden completos.
---

# Skill: Gate 0 Coach (Para No Programadores)

Usa esta skill cuando el usuario quiera iniciar un proyecto nuevo o pida ayuda para definir su app antes de empezar a programar.

## Reglas de Comunicación
1. **Cero jerga técnica:** No hables de "schemas", "arquitectura hexagonal", "RLS", "tokens CSS" ni "bundles" con el usuario. Tradúcelo siempre a beneficios claros (ej. "el cerebro de la app", "los candados de privacidad", "el estilo de tu marca").
2. **Paso a paso:** Haz máximo **3 preguntas simples a la vez** para no abrumar al usuario.
3. **Prohibido programar en Paso 0:** No crees código de aplicación ni pantallas hasta que los 3 documentos base estén completos y aprobados por el usuario.

## Flujo de Trabajo

### 1. Entender la Idea y la Versión 1 (`PROJECT_BRIEF.md`)
- Si el usuario tiene notas sueltas, usa la skill `client-brief` para organizar `PROJECT_BRIEF.md`.
- Ayúdale a recortar lo que no es indispensable para la Versión 1 (MVP) y pásalo a "Módulos Opcionales".

### 2. Definir la Personalidad Visual (`BRAND.md`)
- Pregunta cómo quiere que se sienta la app (3 palabras clave), qué colores le gustan (o proponle 2-3 paletas según su negocio) y si le habla al usuario de "tú" o de "usted".
- Llena `BRAND.md` y confirma que no quiere una estética genérica (*IA Slop*).

### 3. Definir Datos y Candados (`DATA_SECURITY.md`)
- Pregunta en lenguaje simple:
  - ¿Qué información guarda la app?
  - ¿Quién la usa y qué puede hacer cada rol?
  - ¿Necesita funcionar sin internet?
  - ¿Dónde prefiere guardar en la nube (Firebase / PostgreSQL / solo en el dispositivo)?
- Llena `DATA_SECURITY.md` y registra las decisiones clave en `ADR.md`.

### 4. Cierre del Paso 0
- Muestra un resumen corto en español claro de lo que se va a construir, cómo se verá y qué candados tendrá.
- Pide confirmación explícita al usuario para pasar al **Paso 1 (Construir el "Cerebro" y sus pruebas)**.

---
name: gate0-dummies-coach
description: Guía a usuarios no programadores por el Paso 0 (Pre-Flight) en lenguaje claro y sin tecnicismos antes de escribir cualquier línea de código, asegurando que PROJECT_BRIEF.md, BRAND.md y DATA_SECURITY.md queden completos.
---

# Skill: Gate 0 Coach (Para No Programadores)

Usa esta skill cuando el usuario quiera iniciar un proyecto nuevo o pida ayuda para definir su app antes de empezar a programar.

## Reglas de Comunicación
1. **Cero jerga técnica:** No hables de "schemas", "arquitectura hexagonal", "RLS", "tokens CSS" ni "bundles" con el usuario. Tradúcelo siempre a beneficios claros (ej. "el cerebro de la app", "los candados de privacidad", "el estilo de tu marca").
2. **Paso a paso y sin prisa:** Haz máximo **3 preguntas simples a la vez** (o **bloques de 4 checkboxes** en la ronda de capacidades). **El Paso 0 es intencionalmente el paso donde más tiempo invertimos** para que no quede nada ambiguo y evitar retrabajo o gasto innecesario de tokens más adelante.
3. **Prohibido programar en Paso 0:** No crees código de aplicación ni pantallas hasta que los 3 documentos base estén completos y aprobados por el usuario.

## Flujo de Trabajo

### 1. Entender la Idea y la Versión 1 (`PROJECT_BRIEF.md`)
- Si el usuario tiene notas sueltas, usa la skill `client-brief` para organizar `PROJECT_BRIEF.md`.
- Identifica claramente el **giro del negocio** (ej. comercio/POS, consultorio, taller, restaurante, servicios, etc.) y ayuda a recortar lo que no es indispensable para la Versión 1 (MVP), pasándolo a "Módulos Opcionales".

### 1.5. Ronda de Checkboxes de Capacidades (Adaptada al Giro — Para NO adivinar)
- **Lectura previa del catálogo (bajo costo en tokens):** Si `RanVer-Developers/Modulos_reutilizables` está accesible en el entorno, lee **únicamente su archivo `CATALOG.md`** (**prohibido abrir archivos `src/` en el Paso 0**). Usa ese resumen para cruzar el giro del negocio contra los módulos y flags ya existentes (`BASIC` / `INTERMEDIATE` / `ADVANCED`) y redactar los checkboxes en español cotidiano con base en capacidades reales. Si el repositorio no está conectado o aún no tiene `CATALOG.md`, usa los bloques por giro de abajo e informa al usuario.
- **Antes de cerrar `PROJECT_BRIEF.md`**, presenta al usuario una ronda exhaustiva de capacidades en español cotidiano, **agrupadas de 4 en 4** y **adaptadas específicamente al giro del negocio** para que marque qué entra en **Versión 1 (`[x]`)**, qué queda en **Versión 2 (`[V2]`)** y qué **no aplica (`[ ]`)**.
- **Regla de giro:**
  - **Si el proyecto es de Comercio / Tienda / POS**, usa como base estos bloques (ajustando lo que no aplique al comercio específico):
    - *Mostrador y Clientes:* Venta rápida solo a público general vs. directorio de clientes; ventas a crédito / fiado (límite, bloqueo y abonos); pedidos en espera (vendedor arma nota y cajera cobra); descuentos (libres o solo con PIN de supervisor) y precios de mayoreo / por volumen.
    - *Caja y Control Anti-Robo:* Fondo inicial, entradas y retiros de efectivo con motivo obligatorio; arqueo ciego (la cajera no ve el esperado hasta cerrar); alerta de efectivo máximo en cajón; cancelaciones/devoluciones solo con PIN de Dueño/Encargado y permisos editables por persona vs. puestos fijos.
    - *Inventario y Compras:* Método de costeo (Costo Promedio CMP vs. PEPS / FIFO); bloquear venta sin stock vs. permitir existencia negativa; ajustes manuales con motivo obligatorio y bitácora; múltiples bodegas/sucursales y compras a proveedores con actualización automática de costos.
    - *Configuración del Dueño y Respaldos:* Panel de configuración para que el Dueño ajuste reglas, usuarios y permisos sin programar; respaldo/restauración manual local (`.json`) mientras se conecta la nube en V2.
  - **Si el proyecto es de otro giro** (ej. consultorio, clínica, taller mecánico, restaurante, inmobiliaria, logística, servicios), **construye bloques de 4 checkboxes adaptados a la operación real de ese giro** (ej. en consultorio: *Agenda y Recordatorios*, *Expediente Clínico y Recetas*, *Cobro y Facturación*, *Roles y Privacidad*; en taller: *Recepción y Diagnóstico*, *Órdenes de Servicio y Evidencia*, *Refacciones e Inventario*, *Caja y Garantías*) cubriendo tanto la operación diaria como controles anti-error/anti-robo y configuración del dueño.
- **No aceleres esta ronda:** Si un bloque genera dudas o reglas especiales (ej. comisiones, garantías, recetas, entregas parciales), profundiza con otro bloque corto hasta que todo quede claro.
- Traduce cada casilla confirmada directamente a `PROJECT_BRIEF.md` (incluyendo los módulos y flags técnicos aplicables cuando se cruce con `Modulos_reutilizables`).

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

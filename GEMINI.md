# GEMINI.md — Contexto y Reglas del Proyecto

## 1. Contexto del Proyecto
- **Nombre / Propósito:** [Completar o inferir desde PROJECT_BRIEF.md / README]
- **Stack & Entorno:** [Completar o inferir desde package.json / pyproject.toml / etc.]
- **Estado:** [Bootstrap (0→1) | Desarrollo activo | Producción]
- **Reglas y Skills del Proyecto:**
  - **Plan maestro (para no programadores):** Sigue siempre el flujo de `PLAYBOOK.md` (Paso 0 → Paso 4). No escribas código de aplicación ni pantallas antes de completar el Paso 0 (`PROJECT_BRIEF.md`, `BRAND.md`, `DATA_SECURITY.md` y `ADR.md`).
  - **Reglas técnicas:** Revisa siempre `.agent/rules/` (o `rules/`) al inicio para aplicar las normas activas (ej. `stack-multiplatform.md` u otras que se agreguen).
  - **Skills operativas del repo (Lectura obligatoria):** Al iniciar cualquier Paso (0, 1, 2, 3 o 4), **ANTES de crear o editar archivos**, lee el `SKILL.md` de todas las skills asignadas a esa etapa (o indica explícitamente al usuario si alguna no aplica al alcance):
    - Paso 0 (Arranque): `gate0-dummies-coach`, `client-brief`. Si `RanVer-Developers/Modulos_reutilizables` está accesible en el entorno, lee **únicamente su archivo `CATALOG.md`** para alinear la entrevista y checkboxes con las capacidades y niveles (`BASIC` / `INTERMEDIATE` / `ADVANCED`) reales del catálogo (**prohibido abrir archivos `src/` durante el Paso 0** para evitar gasto innecesario de tokens).
    - Paso 1 (Core Headless y Módulos): **PROHIBIDO inventar lógica propia antes de consultar `RanVer-Developers/Modulos_reutilizables`** (local montado o GitHub).
      - **Regla de Bloqueo:** Si `RanVer-Developers/Modulos_reutilizables` no está accesible o devuelve 403/404, **DETENTE inmediatamente** y pide al usuario conectar el repositorio en los recursos del proyecto (o autorizar crear la lógica desde cero) antes de crear cualquier paquete `packages/*`.
      - Inspecciona los archivos reales de `src/index.ts` y `*-features.ts` de cada módulo antes de usar símbolos o banderas.
      - Entrega y confirma con el usuario el **Contrato de Flags (`BASIC` / `INTERMEDIATE` / `ADVANCED` + overrides)** y los **adaptadores de persistencia** (`IndexedDB` / `SQLite` / `Firestore`; `InMemory` solo para tests y `LocalStorage` solo para demos temporales si el usuario lo autoriza) antes de pasar al Paso 2.
      - Para lógica propia nueva aplica `tdd`, `vitest`, `zod-validation-utilities` y `stack-multiplatform.md` (aplica `npm-package` solo si vas a crear o empaquetar un módulo `@modulos/*` publicable).
    - Paso 2 (UI y Multiplataforma): `react-best-practices`, `frontend-design`, `refactoring-ui`, `accessibility`, `capacitor-best-practices`, `tauri-v2` (respetando `BRAND.md` y `DESIGN.md`).
      - La UI debe consumir los casos de uso reales de `@modulos/*` a través de adaptadores, nunca reescribir reglas de negocio en componentes ni stores paralelos.
      - Si trabajas en una VM remota, entrega un build estático (`dist/`) o publica vista previa accesible (GitHub Pages / Vercel / Netlify cuando esté conectado) desde el primer entregable funcional; nunca dependas solo de `localhost` como única vía de validación.
    - Paso 3 (Seguridad y Release): `security-and-hardening`, `firestore-rules-creation`, `firebase-security-rules-auditor`, `pr-checklist` (validando contra `REVIEW.md`).
    - Paso 4 (Mantenimiento y Evolución): Clasifica el cambio según `PLAYBOOK.md` (bug con test en `vitest`, ajuste UI o nuevo módulo desde `PROJECT_BRIEF.md`). **Ante cualquier nueva función o módulo solicitado, antes de escribir código nuevo, consulta `RanVer-Developers/Modulos_reutilizables` buscando específicamente si esa capacidad ya existe en el nivel actual o en un nivel superior (`intermedio` / `avanzado`), e informa al usuario si está disponible para reutilizarla en lugar de inventarla desde cero (si el repositorio no es accesible, detente y avisa antes de programar).** Ejecuta `pr-checklist` + `REVIEW.md` antes de cada Pull Request.

## 2. Flujo de Trabajo del Agente
- **Idioma:** Responde siempre en español. Código, identificadores, comentarios técnicos y commits en inglés.
- **Fuentes de verdad:** Antes de asumir versiones, scripts o contratos, inspecciona `package.json`, `pyproject.toml`, esquemas o la estructura real del repo. Nunca asumas que un archivo o símbolo existe sin verificarlo.
- **Inspección de contratos reales:** Antes de importar cualquier función, clase o `FeatureFlag` de `@modulos/*`, verifica su nombre exacto en `packages/<modulo>/src/index.ts` y `*-features.ts`. Prohibido asumir nombres por memoria.
- **Lectura eficiente:** Antes de abrir archivos extensos, busca primero símbolos, rutas o texto relevante. Lee solo el contexto necesario para tomar una decisión segura.
- **Documentación actual:** Para APIs, frameworks o herramientas que cambian con frecuencia, consulta documentación oficial cuando esté disponible, además de los archivos de bloqueo/configuración del proyecto, antes de implementar.
- **Planifica antes de cambios relevantes:** Si una tarea implica ambigüedad arquitectónica, cambios públicos, migraciones, dependencias nuevas o riesgo apreciable, presenta un plan breve antes de editar. Para cambios rutinarios, procede directamente.
- **Alcance mínimo:** Modifica solo lo necesario. No refactorices código ajeno ni cambies estilos/formateo fuera del alcance pedido.
- **Circuit Breaker:** Si un error de compilación, tipos o pruebas persiste tras 2 intentos sin progreso claro, detente, explica la causa raíz y propón alternativas.
- **Terminal no bloqueante:** Nunca ejecutes servidores o procesos `watch` en primer plano. Usa siempre ejecución única (`--run`, `--watchAll=false`, `build`).
- **Reportes honestos:** Reporta únicamente archivos modificados y comandos realmente ejecutados tras tu última edición.

## 3. Estándares de Código y Arquitectura
- **Principios:** KISS, YAGNI y DRY. En fase Bootstrap evita abstracciones prematuras; en Desarrollo/Producción respeta la arquitectura y capas ya establecidas.
- **Tipado y Calidad:** Tipado estricto (sin `any` ni supresiones injustificadas). Funciones pequeñas, retornos tempranos y nombres consistentes con las convenciones del lenguaje y del proyecto.
- **Manejo de errores y bordes:** Valida toda entrada externa (HTTP, CLI, formularios, APIs) en tiempo de ejecución. Nunca silencies excepciones con `catch` vacíos; registra contexto útil sin exponer datos sensibles.
- **Sistema de logs (Mejora continua):** Toda aplicación debe incluir por defecto un registro local de errores recientes (últimos ~50 eventos con fecha/hora, pantalla, acción y detalle técnico sanitizado, sin PII ni secretos) exportable desde UI (*"Copiar reporte técnico"*). Si el proyecto incluye nube/soporte remoto, conectar envío automático de errores (ej. Sentry o colección de logs).
- **Tests:** Si el proyecto cuenta con infraestructura de pruebas, al corregir un bug añade o actualiza una prueba que reproduzca el fallo; al añadir lógica crítica, incluye pruebas proporcionales al riesgo.
- **Dependencias:** Prioriza soluciones nativas y librerías ya instaladas. Pide confirmación antes de agregar dependencias nuevas o pesadas.

## 4. Seguridad y Datos
- **Zero Secrets:** Prohibido hardcodear API keys, tokens, contraseñas o URLs privadas. Documenta toda nueva variable en `.env.example` (versionado). Mantén `.env`, `.env.local` y `.env.*.local` fuera de Git; `.env.example` debe permanecer versionado.
- **Seguridad básica:** Aplica principio de mínimo privilegio y prevén inyecciones (SQLi, XSS, command injection y SSRF cuando aplique) sanitizando, validando y parametrizando entradas.
- **Persistencia:** Mantén esquemas, migraciones y reglas de seguridad versionados. Usa transacciones u operaciones atómicas en escrituras críticas.

## 5. Verificación y Git
- **Cierre adaptativo:** Inspecciona los scripts del proyecto y ejecuta los relevantes al alcance del cambio (typecheck, lint, tests, build). En fase Bootstrap basta con compilación y chequeo de tipos limpios. Si hay fallos preexistentes, repórtalos sin atribuirlos al cambio actual.
- **Git:** Crea commits siguiendo Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`). Haz un **commit de respaldo al cerrar y aprobar cada compuerta** (`Paso 0`, `Paso 1`, `Paso 2`, `Paso 3`) para blindar el avance antes de iniciar la siguiente etapa. Trabajar en ramas `feat/...` o `fix/...` y abrir Pull Request hacia `dev` o `main` usando la plantilla de `.github/PULL_REQUEST_TEMPLATE.md`.
- **Auditoría pre-lanzamiento (solo en Producción):** Ejecuta el escaneo de vulnerabilidades disponible para el gestor de paquetes (`npm audit` o equivalente) y verifica que no queden secretos en el historial de Git.

## 6. Prohibiciones Explícitas
- NO uses `@ts-ignore`, `eslint-disable` o `# noqa` sin justificación técnica en un comentario.
- NO uses `--no-verify` ni desactives reglas de seguridad/linter.
- NO elimines o alteres migraciones, esquemas, endpoints públicos o contratos existentes sin advertir el impacto y obtener confirmación cuando implique un cambio incompatible.
- NO ejecutes comandos destructivos ni borres datos o archivos del usuario sin confirmación explícita.
- NO des una tarea por terminada sin listar qué cambió y qué verificaciones pasaron.

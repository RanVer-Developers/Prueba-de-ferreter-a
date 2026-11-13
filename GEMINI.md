# GEMINI.md — RanVer Developers

Este archivo define las reglas maestras para Antigravity y Gemini Pro en todos los proyectos de **RanVer Developers**.

---

## 1. Contexto de Negocio y Usuario Final
- **Mercado:** PyMEs y negocios en crecimiento en México (tiendas, talleres, consultorios, distribuidoras, servicios).
- **Perfil del usuario:** Personas no técnicas, muchos acostumbrados a libreta/Excel o adultos mayores.
- **Modelo:** Entrada accesible con un **MVP funcional y claro**, diseñado para crecer por módulos (nube, reportes avanzados, multi-sucursal, soporte remoto).
- **Idioma:** Todo texto visible para el usuario final debe estar en **español de México** claro, natural y sin tecnicismos (evitar anglicismos innecesarios como *dashboard*, *submit*, *login* → usar *Inicio*, *Guardar*, *Entrar*).

---

## 2. Arquitectura y Stack Técnico
- **Lenguaje:** TypeScript estricto (`strict: true`). Evitar `any`.
- **Arquitectura:** **Clean Architecture & Domain-Driven Design (DDD)**.
  - `domain/`: Entidades, Value Objects, reglas de negocio e interfaces de repositorios en **TypeScript puro** (cero dependencias de frameworks, UI o base de datos).
  - `application/`: Casos de uso (Use Cases) y DTOs. Orquestan el dominio.
  - `infrastructure/`: Implementaciones concretas (persistencia local/nube, APIs, adaptadores).
  - `presentation/` (o `apps/`): Interfaz multiplataforma (Web / PWA / Móvil / Desktop) que consume los casos de uso.
- **Módulos reutilizables:** Antes de escribir lógica genérica nueva (clientes, inventario, ventas, citas, caja, autenticación), verificar si ya existe en el monorepo de módulos de la organización.
- **Multiplataforma:** Mantener la lógica de negocio 100% desacoplada de la UI para poder compartirla entre web, móvil y escritorio.

---

## 3. Reglas de Desarrollo para la IA
1. **Simplicidad ante todo (YAGNI):** No sobre-ingenierizar ni agregar librerías innecesarias.
2. **Respetar las capas:** Nunca importar librerías de UI (React, Tailwind, etc.) ni SDKs de base de datos dentro de `domain/` o `application/`.
3. **Datos seguros:** Nunca exponer llaves, tokens o credenciales en el código. Usar variables de entorno.
4. **Cambios pequeños y explicables:** Si una tarea es grande, proponer un plan breve antes de editar múltiples archivos.
5. **Idioma de trabajo:** Responder y documentar en español; nombrar archivos, clases, funciones y variables en inglés técnico estándar (o según convención del módulo).

---

## 4. Flujo de Trabajo del Equipo (Remoto)
- **Producto / Prototipado:** Levantamiento en `PROJECT_BRIEF.md`, prototipos de UI y pruebas funcionales.
- **Ingeniería / Core:** Revisión de arquitectura, dominio, seguridad, migraciones y despliegue.
- **Git:** Trabajar en ramas `feat/...` o `fix/...` y abrir Pull Request hacia `dev` o `main` usando la plantilla de `.github/PULL_REQUEST_TEMPLATE.md`.

---
name: pr-checklist
description: Audita los cambios antes de abrir un Pull Request verificando Clean Architecture, TypeScript estricto, UX accesible y seguridad básica.
---

# Skill: PR Checklist (RanVer Developers)

Usa esta skill antes de crear un Pull Request o cuando el usuario pida revisar su código antes de enviarlo a revisión.

## Pasos de Auditoría
1. **Clean Architecture & DDD:**
   - Verifica que `domain/` no importe nada de UI, base de datos ni librerías externas.
   - Verifica que la lógica de negocio esté en `domain/` o `application/`, no dentro de componentes visuales.
2. **TypeScript:**
   - Busca usos de `any` injustificados o errores de tipo.
3. **UX para usuario no técnico (según `DESIGN.md`):**
   - ¿Todos los textos visibles están en español claro y sin tecnicismos?
   - ¿Las acciones destructivas tienen confirmación?
   - ¿Los mensajes de error son comprensibles para cualquier persona?
4. **Seguridad:**
   - Verifica que no haya claves, contraseñas o tokens hardcodeados.
5. **Resumen:**
   - Entrega un listado breve con ✅ (cumple) y ⚠️ (por corregir, con archivo y línea exacta).

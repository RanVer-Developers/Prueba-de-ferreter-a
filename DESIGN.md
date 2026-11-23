# DESIGN.md — Sistema de Diseño RanVer Developers

Principios de diseño para aplicaciones dirigidas a PyMEs mexicanas y usuarios no técnicos o adultos mayores.

---

## 1. Principios de UX (Prioridad #1)
- **Cero fricción:** Si un usuario de 60 años que hoy usa libreta no entiende qué hacer en 5 segundos, el diseño falló.
- **Un objetivo por pantalla:** Evitar pantallas saturadas con 20 botones. Mostrar solo las acciones principales.
- **Botones claros y grandes:** Áreas táctiles mínimas de `44x44px` (ideal `48px` de alto en acciones principales).
- **Texto + Ícono:** Nunca usar solo un ícono ambiguo para acciones importantes; acompañar siempre con etiqueta clara (ej. `[+] Nueva Venta`, `[Guardar]`).
- **Tolerancia a errores:**
  - Confirmar antes de eliminar o cancelar algo importante (*"¿Seguro que deseas eliminar este cliente?"*).
  - Mensajes de error humanos y accionables (ej. *"Falta escribir el teléfono"* en lugar de *"ValidationError: phone is required"*).
- **Feedback inmediato:** Mostrar estados claros de *Cargando...*, *Guardado correctamente* o *Sin conexión*.
- **Soporte fácil (Logs para el cliente):** Incluir en el menú de *Ayuda / Soporte* un botón claro (**`Copiar reporte técnico`**) para que el usuario pueda enviar errores recientes por WhatsApp sin abrir herramientas técnicas.

---

## 2. Tipografía y Legibilidad
- **Tamaño base:** Mínimo `16px` en cuerpo de texto; `18px+` en datos clave (totales, precios, nombres).
- **Fuente recomendada:** Sans-serif limpia y legible (`Inter`, `Plus Jakarta Sans` o `System UI`).
- **Contraste:** Mínimo WCAG AA (`4.5:1` para texto normal). Evitar textos gris claro sobre fondo blanco.

---

## 3. Paleta Base (Adaptable por Cliente)
Cada proyecto define sus colores de marca aquí, manteniendo esta estructura semántica:
- **Fondo principal:** `#F8FAFC` (blanco suave, menos cansado que `#FFFFFF` puro).
- **Superficie / Tarjetas:** `#FFFFFF` con borde sutil `#E2E8F0`.
- **Texto principal:** `#0F172A` (casi negro, alto contraste).
- **Texto secundario:** `#475569`.
- **Primario (Marca del cliente):** Definir por proyecto (ej. `#2563EB` azul confiable).
- **Semánticos:**
  - Éxito / Pagado: `#16A34A`
  - Advertencia / Pendiente: `#D97706`
  - Peligro / Eliminar / Adeudo: `#DC2626`

---

## 4. Responsive y Multiplataforma
- Diseñar **Mobile-First** (muchos dueños de negocio operan desde el celular o tablet en mostrador).
- En escritorio, aprovechar el espacio sin perder la simplicidad (máximo 2–3 columnas limpias).

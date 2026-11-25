# PLAYBOOK.md — Guía Paso a Paso para Crear tu App (Sin Saber Programar)

> **¿Para quién es esta guía?** Para ti, que tienes la idea del negocio o proyecto y vas a dirigir a tu asistente de IA para construir una aplicación real, segura, multiplataforma (Web, Celular o Computadora) y con personalidad propia.
> **Regla de oro:** Tú pones la visión, las reglas del negocio y el buen gusto; la IA se encarga del código, la arquitectura y los candados técnicos.

---

## Las 5 Reglas de Oro (Para que tu app salga bien a la primera)

1. **No empieces pidiendo pantallas:** Si le pides a la IA "hazme una app de X" sin plan, va a improvisar, se verá genérica (*IA Slop*) y tendrá huecos de seguridad.
2. **Primero la Versión 1 (MVP):** Haz una lista corta de lo indispensable para que la app sirva hoy. Todo lo "bonito pero no urgente" va a una lista de mejoras futuras.
3. **Personalidad propia:** Antes de diseñar botones, define los colores, el estilo y el tono de tu marca en `BRAND.md`. Así tu app no parecerá plantilla genérica.
4. **Seguridad desde el día 1:** Define quién puede ver, crear o borrar cada dato en `DATA_SECURITY.md` antes de guardar información real.
5. **No reinventar la rueda:** La IA ya tiene reglas internas (`GEMINI.md` y `.agent/rules/`) para usar piezas probadas y no inventar código frágil desde cero.
6. **Guarda un punto de respaldo por paso:** Cada vez que apruebes un paso (`Paso 0`, `Paso 1`, `Paso 2`, `Paso 3`), dile a la IA: *"Guarda este avance en Git (`commit`) antes de pasar al siguiente paso."* Así siempre puedes volver atrás si algo se rompe.

---

## El Plan en 4 Pasos (De la Idea a la App Lista)

### Paso 0: Preparar el terreno (OBLIGATORIO antes de programar)
No se escribe ni una línea de código hasta tener listos estos 3 documentos (la IA te ayuda a llenarlos haciéndote preguntas sencillas):

| Documento | ¿Qué responde en palabras simples? | ¿Cómo lo llenas? |
| :--- | :--- | :--- |
| **`PROJECT_BRIEF.md`** | ¿Qué problema resuelve, quién la usa y qué trae la Versión 1? | Pega tus notas o idea y dile a la IA: *"Usa la skill `client-brief` para llenar `PROJECT_BRIEF.md`."* |
| **`BRAND.md`** | ¿Cómo se ve, qué colores usa y cómo le habla al usuario? | Dile a la IA: *"Ayúdame a llenar `BRAND.md` con preguntas simples para que mi app tenga personalidad propia."* |
| **`DATA_SECURITY.md`** | ¿Qué datos guarda, quién tiene permiso de verlos y si funciona sin internet? | Dile a la IA: *"Ayúdame a definir los permisos y datos en `DATA_SECURITY.md`."* |

*(Opcional: `ADR.md` sirve para anotar decisiones importantes, como "elegimos solo Web primero" o "también la queremos en Android", para no olvidarlo después).*

> **¿Qué decirle a la IA para empezar?**
> *"Hola, quiero crear una app de [tu idea]. Usa la skill `gate0-dummies-coach`, hagamos la entrevista completa con checkboxes según mi giro y no pasemos a programar hasta que todo quede claro."*

*(Nota: El Paso 0 es intencionalmente el paso donde más tiempo invertimos. Dejar todo definido aquí evita adivinar funciones, retrabajar y gastar tokens de más después).*

---

### Paso 1: Construir el "Cerebro" (Reutilizar módulos + Reglas del negocio + Pruebas)
Antes de dibujar pantallas bonitas, la IA arma el "cerebro" de tu app (cuentas, validaciones, reglas y guardado).

1. **Verificar acceso a `Modulos_reutilizables`:** Si el repositorio `RanVer-Developers/Modulos_reutilizables` (`https://github.com/RanVer-Developers/Modulos_reutilizables`) no está conectado, la IA debe **detenerse y pedírtelo** antes de programar nada.
2. **Confirmar capacidades y niveles (`BASIC` / `INTERMEDIATE` / `ADVANCED`):** La IA te muestra qué módulos traerá y qué banderas encenderá según los checkboxes confirmados en tu `PROJECT_BRIEF.md`.
3. **Solo programa lo nuevo:** La lógica específica de tu negocio que no exista en esos módulos se construye en TypeScript puro con sus **pruebas automáticas** (`vitest`) para comprobar que nunca falle.
4. **Adaptadores listos antes de UI:** Antes de pasar al Paso 2, cada módulo seleccionado queda conectado a su adaptador de guardado real (`IndexedDB` / `SQLite` / `Firestore`) y probado en `Vitest` para que la interfaz nunca duplique lógica de negocio.

- **¿Por qué así?** No reinventas la rueda en cosas críticas (como dinero o inventarios) y, si cambias el diseño mañana o pasas tu app de Web a Celular, el "cerebro" sigue intacto y funcionando igual.
- **Tu papel aquí:** Confirmar qué módulos reutilizables y niveles sí aplican a tu Versión 1 y revisar que la IA entendió bien tus reglas propias.
- **¿Qué decirle a la IA?**
  > *"Ya tenemos listo el Paso 0. Revisa `https://github.com/RanVer-Developers/Modulos_reutilizables`, confírmame los módulos, flags y adaptadores de guardado que aplican a nuestro `PROJECT_BRIEF.md`, y construye solo la lógica propia que falte con sus pruebas automáticas, sin hacer pantallas todavía."*

---

### Paso 2: Vestir la App (Pantallas + Celular / Escritorio)
Ahora sí la IA construye las pantallas usando tu `BRAND.md` y `DESIGN.md`, y las conecta al "cerebro" del Paso 1. Si tu proyecto también va para celular (Android/iOS) o computadora (Windows/Linux), la IA empaqueta la misma app para esas plataformas.

- **Reglas clave de esta etapa:**
  - **Prueba en vivo accesible:** Si trabajas con la IA en la nube (VM remota), pídele entregar el build listo o publicar desde el inicio en GitHub Pages, Vercel o Netlify (si están conectados) para probar desde tu celular o computadora real sin depender solo de `localhost`.
  - **Configuración del Dueño visible:** Toda app con múltiples roles o reglas activables debe incluir una pestaña de **Configuración** exclusiva del Dueño para editar usuarios, permisos granulares y reglas del negocio marcadas en `PROJECT_BRIEF.md`.

- **Tu papel aquí (Anti-IA Slop):**
  - Abre la app y pruébala como si fueras un cliente nuevo.
  - Pregúntate: *¿Se entiende qué hacer en 5 segundos? ¿Los textos suenan humanos y en español claro? ¿Los botones son fáciles de tocar en el celular?*
- **¿Qué decirle a la IA?**
  > *"Construye las pantallas siguiendo `BRAND.md` y `DESIGN.md`. Quiero probar el flujo principal en [Web / Celular / Escritorio]."*

---

### Paso 3: Candados de Seguridad y Lanzamiento
Antes de que la use tu primer cliente o usuario real, la IA hace una revisión completa de seguridad, permisos y calidad.

- **¿Qué verifica la IA por ti?**
  - Que nadie pueda ver ni borrar datos de otros usuarios.
  - Que no haya contraseñas o llaves secretas escondidas en el código.
  - Que la app compile limpia y sin errores para todas las plataformas elegidas.
- **¿Qué decirle a la IA?**
  > *"Haz la auditoría final de seguridad, permisos y checklist de lanzamiento antes de publicar."*

---

### Paso 4: Mantenimiento, Soporte y Crecimiento (Ciclo Continuo)
Cuando la app ya está operando con el cliente, el trabajo no termina: aquí es donde nacen mejoras, correcciones y nuevos módulos de pago (*upsells* como respaldo en nube, multi-sucursal o reportes avanzados). Para no romper lo que ya funciona en producción, cada solicitud entra por uno de estos 3 carriles:

1. **Corrección de error (Bug):** Si algo falla con el cliente, pídele presionar **`Copiar reporte técnico`** en *Ayuda / Soporte* y enviártelo por WhatsApp (o revisa los logs en la nube si tiene plan remoto). Pasa ese reporte a la IA para que primero cree una prueba automática en `vitest` que reproduzca el fallo (**Paso 1**) y luego lo corrija en una rama `fix/...`.
2. **Ajuste visual o de texto:** Cambios menores de pantalla o redacción se hacen respetando `BRAND.md` y `DESIGN.md` (**Paso 2**).
3. **Nuevo módulo o servicio adicional:** Si el cliente contrata una nueva capacidad, primero actualiza `PROJECT_BRIEF.md` (**Paso 0**) y vuelve a recorrer `Paso 1 → Paso 3` solo para ese módulo nuevo.

- **¿Qué decirle a la IA?**
  > *"El cliente reportó [bug / ajuste / nuevo módulo]. Ubica si corresponde a corrección, ajuste visual o actualización de `PROJECT_BRIEF.md`, trabaja en una rama nueva y usa `REVIEW.md` antes de abrir el PR."*

---

## Señales de Alerta (Qué vigilar aunque no sepas programar)
- ❌ Si la IA empieza a crear pantallas antes de que hayas aprobado `PROJECT_BRIEF.md` y `BRAND.md`: **detenla** y pídele volver al Paso 0.
- ❌ Si ves mensajes en inglés técnico (*"Error 500: undefined is not an object"*): dile *"Cambia todos los mensajes de error a español claro para cualquier persona."*
- ❌ Si el diseño se ve gris, genérico o lleno de botones pequeños: dile *"Revisa `BRAND.md` y `DESIGN.md`, dale más personalidad y simplifica esta pantalla."*
- ❌ Si la app ya la usa un cliente real y la IA quiere editar directo en `main` sin rama ni pruebas: **detenla** y pídele trabajar en una rama `fix/...` o `feat/...` con Pull Request.


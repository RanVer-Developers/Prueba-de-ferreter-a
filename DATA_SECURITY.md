# DATA_SECURITY.md — Datos, Privacidad y Candados de Seguridad

> Completa esto antes de programar. La IA usará estas respuestas para crear los candados reales de tu base de datos y proteger la información.

## 1. ¿Qué información va a guardar la app?
*(Lista simple en lenguaje normal: ej. "Clientes, productos, ventas, citas, fotos de recibos")*
- Entradas y salidas de vehículos (placas o descripción, cajón asignado, hora exacta de entrada y salida)
- Cobros realizados y método/monto en efectivo (\$20 por hora o fracción)
- Configuración de cajones y tarifas
- Registro de cortes de caja y eventos sensibles (cancelaciones o cambios autorizados con PIN)

## 2. ¿Quiénes usan la app y qué puede hacer cada quien?
*(Define los roles. Ejemplo: "Dueño: ve todo y borra. Empleado: solo registra ventas, no puede borrar ni ver ganancias")*
- **Rol 1 (Dueño / Admin — con PIN secreto):** Ve todas las métricas, ganancias acumuladas y cortes; puede cambiar tarifas, configurar cajones y autorizar cancelaciones o correcciones.
- **Rol 2 (Encargada / Operador):** Solo puede registrar entradas, cobrar salidas e imprimir tickets. No puede borrar historial, cancelar cobros, cambiar tarifas ni ver las métricas globales de ganancia sin el PIN del dueño.

## 3. Privacidad entre usuarios / negocios
- **¿Un usuario puede ver los datos de otro usuario o negocio?**
  - [x] No, cada quien solo ve lo suyo (aislamiento estricto).
  - [ ] Solo dentro de su misma empresa/equipo.
  - [ ] Hay información pública (especificar qué):

## 4. Modo de Trabajo e Internet
- **¿Necesita funcionar cuando se va el internet?**
  - [x] Sí, debe seguir funcionando y sincronizar cuando regrese la señal. *(En Versión 1 opera 100% local en el dispositivo).*
  - [ ] No, siempre habrá internet.
- **¿Dónde se guardan los datos en la nube?**
  - [ ] Firebase (Auth + Firestore)
  - [ ] PostgreSQL
  - [x] Solo local en el dispositivo (sin nube) *(en Versión 1; nube queda como módulo opcional futuro)*

## 5. Acciones Delicadas (Requieren confirmación y registro)
*(Marca las que aplican en tu app)*
- [x] Borrar clientes, productos o registros históricos *(prohibido para la encargada; solo con PIN del dueño y dejando rastro)*
- [x] Cancelar ventas / devolver dinero *(requiere PIN del dueño y registro de auditoría)*
- [x] Cambiar precios o permisos de usuarios *(requiere PIN del dueño)*
- [x] Exportar listas completas de clientes o finanzas *(requiere PIN del dueño)*

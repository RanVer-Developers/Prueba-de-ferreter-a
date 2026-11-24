# DATA_SECURITY.md — Datos, Privacidad y Candados de Seguridad

> Completa esto antes de programar. La IA usará estas respuestas para crear los candados reales de tu base de datos y proteger la información.

## 1. ¿Qué información va a guardar la app?
*(Lista simple en lenguaje normal: ej. "Clientes, productos, ventas, citas, fotos de recibos")*
- 
- 
- 

## 2. ¿Quiénes usan la app y qué puede hacer cada quien?
*(Define los roles. Ejemplo: "Dueño: ve todo y borra. Empleado: solo registra ventas, no puede borrar ni ver ganancias")*
- **Rol 1 (ej. Dueño / Admin):**
- **Rol 2 (ej. Operador / Cliente):**

## 3. Privacidad entre usuarios / negocios
- **¿Un usuario puede ver los datos de otro usuario o negocio?**
  - [ ] No, cada quien solo ve lo suyo (aislamiento estricto).
  - [ ] Solo dentro de su misma empresa/equipo.
  - [ ] Hay información pública (especificar qué):

## 4. Modo de Trabajo e Internet
- **¿Necesita funcionar cuando se va el internet?**
  - [ ] Sí, debe seguir funcionando y sincronizar cuando regrese la señal.
  - [ ] No, siempre habrá internet.
- **¿Dónde se guardan los datos en la nube?**
  - [ ] Firebase (Auth + Firestore)
  - [ ] PostgreSQL
  - [ ] Solo local en el dispositivo (sin nube)

## 5. Acciones Delicadas (Requieren confirmación y registro)
*(Marca las que aplican en tu app)*
- [ ] Borrar clientes, productos o registros históricos
- [ ] Cancelar ventas / devolver dinero
- [ ] Cambiar precios o permisos de usuarios
- [ ] Exportar listas completas de clientes o finanzas

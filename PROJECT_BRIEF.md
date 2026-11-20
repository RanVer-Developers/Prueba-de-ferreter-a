# PROJECT_BRIEF.md — Ficha de Proyecto

> Completar este documento antes de escribir código. Sirve para alinear al cliente, Producto y Desarrollo.

## 1. Datos del Cliente y Negocio
- **Nombre del negocio:** Estacionamiento Público (Ejemplo)
- **Giro:** Estacionamiento público
- **Ciudad:** Por definir
- **Contacto principal:** Dueño del estacionamiento
- **Cómo llevan el control hoy:** Control manual (a mano / libreta), sin registro confiable de entradas, salidas ni ganancias reales.

## 2. Problema Principal a Resolver
- El dueño no tiene visibilidad real de cuántos vehículos entran y salen ni cuánto dinero debería reportar la encargada, lo que genera riesgo de fugas o robos. Además, el cálculo de tiempo y cobro se hace a mano y sin comprobante impreso.

## 3. Alcance del MVP (Versión 1 — Precio de entrada)
*Regla: Solo lo indispensable para que el cliente empiece a usar la app y vea valor rápido.*
- [ ] **Registro de entradas y cajones:** Anotar vehículo (placas/descripción), hora de entrada exacta y cajón asignado.
- [ ] **Cálculo automático y cobro por tiempo:** Calcular el monto a pagar según el tiempo transcurrido al registrar la salida (\$20 pesos por hora o fracción).
- [ ] **Impresión de ticket térmico Bluetooth:** Imprimir ticket con hora de entrada, hora de salida, cajón, datos del vehículo y total cobrado.
- [ ] **Corte y control de caja (Anti-fugas):** Registro inalterable de entradas, salidas y total recaudado para que el dueño verifique exactamente cuánto debe entregar la encargada.

## 4. Módulos Opcionales / Crecimiento Futuro (Servicios con costo extra)
- [ ] Respaldo y sincronización en la nube (para ver ingresos desde otro teléfono)
- [ ] Pensiones mensuales / clientes frecuentes
- [ ] Multi-sucursal / múltiples encargados
- [ ] Reportes avanzados / exportación contable
- [ ] Soporte remoto prioritario

## 5. Requisitos Técnicos y Módulos Reutilizables
- **Plataformas objetivo:** [ ] Web / PWA  [x] Android  [ ] iOS  [ ] Escritorio
- **¿Requiere funcionar sin internet (Offline-first)?** Sí (100% local en Android sin internet)
- **Módulos del monorepo RanVer a reutilizar:**
  - `@modulos/core-cashier` (turnos, cobros en centavos, cortes X/Z, formateador ESC/POS)
  - `@modulos/core-auth-rbac` (PIN secreto del dueño, roles y aprobación de supervisor)
  - `@modulos/cashier-react` (hooks de caja para la UI en Paso 2)

# STACK-MULTIPLATFORM.md — Arquitectura y Stack Oficial de Proyectos

Este documento define la arquitectura técnica estándar para el desarrollo de aplicaciones comerciales y módulos reutilizables multiplataforma (Web, Android, iOS, Windows y Linux).

---

## 1. Filosofía de Arquitectura: "Headless Domain Modules"

El código se divide estrictamente en tres capas desacopladas:

1. **Módulos de Dominio (`@modulos/core-*` — Headless / Lógica Pura):**
   * Viven aislados en paquetes independientes dentro del monorepo.
   * **PROHIBIDO** importar React, HTML, CSS, Zustand o librerías de UI dentro de los módulos `core-*`.
   * **PROHIBIDO** importar un módulo `core-*` dentro de otro módulo `core-*` (excepto `@modulos/core-shared`). La orquestación ocurre únicamente en la aplicación final.
   * Contienen: Contratos/interfaces (`IStorageAdapter`, `IPrinterAdapter`), esquemas Zod con versionado, aritmética monetaria exacta, máquinas de estado y casos de uso puros.
   * Todo módulo debe contar con pruebas unitarias en Vitest que certifiquen su lógica antes de conectarse a cualquier interfaz.

2. **Capa de Bindings Reactivos (`@modulos/react-bindings` o `@modulos/<modulo>/react`):**
   * Envuelve la lógica pura de los módulos `core-*` en hooks de React (`useCashRegister`, `useInventory`, `useBarcodeScanner`) recibiendo los adaptadores por inyección de dependencias.
   * Mantiene los paquetes `core-*` 100% ejecutables en entornos sin React (Node.js, Bun, Firebase Functions, Web Workers).

3. **Capa de Presentación y Adaptadores (Apps / Shells):**
   * Implementa los adaptadores concretos de plataforma (`SqliteCashAdapter`, `TauriPrinterAdapter`, `CapacitorBluetoothAdapter`).
   * Consume los hooks de negocio y pinta la interfaz visual (React + Tailwind).

---

## 2. Tecnologías Estándar del Ecosistema

### 2.1. Núcleo Común (Compartido al 100% en todas las plataformas)
* **Lenguaje:** TypeScript estricto (`strict: true`, prohibido `any` y aserciones `as unknown as T`).
* **Validación y Versionado de Dominio:** Zod en todas las fronteras (entradas de usuario, hardware, red y almacenamiento). Todo esquema raíz persistido debe incluir `schemaVersion: z.number()` para soportar migraciones locales seguras.
* **Aritmética Monetaria:** **PROHIBIDO** operar montos financieros con flotantes nativos de JavaScript (`number` con decimales). Todos los módulos de dominio operan en **enteros mínimos (centavos)** o mediante librería decimal estricta con redondeo bancario explícito (`ROUND_HALF_EVEN`).
* **Capa Visual:** React (Vite) + Tailwind CSS.
* **Iconografía:** Lucide React.
* **Componentes Base / Primitivas:** Radix UI / Headless UI (estilo Shadcn).
* **Estado Global y Caché:** Zustand (únicamente en capa UI para estado volátil de pantalla/sesión, nunca acoplado a `localStorage` para datos de negocio) + TanStack Query (para sincronización remota).
* **Testing:** Vitest para lógica de negocio, casos límite y validación de esquemas.

### 2.2. Empaquetadores por Plataforma (Mismo código React + Tailwind)
* **Web (SaaS / Panel Admin / Kiosco Web):** Vite SPA.
* **Móvil (Android / iOS / Tablets POS):** Capacitor.
  * Plugins nativos clave:
    * Bluetooth ESC/POS: `@capacitor-community/bluetooth-le`
    * Escaneo de códigos: `@capacitor-mlkit/barcode-scanning`
    * Sistema de archivos: `@capacitor/filesystem`
    * Red: `@capacitor/network`
* **Escritorio (Windows / Linux / macOS):** Tauri v2.
  * Windows: Acceso directo a drivers de impresora y puertos COM de báscula.
  * Linux: Comunicación directa con `/dev/usb/lp0` (impresoras térmicas) y `/dev/ttyUSB0` (básculas/cajón).
  * Huella de memoria máxima esperada: menos de 40 MB de RAM.
* **Backend / Cloud Functions:** Node.js o Bun en Firebase Functions / Cloud Run (reutiliza directamente `@modulos/core-*`).

### 2.3. Persistencia y Flujo Local-First
* **Remoto (Cloud):** Cloud Firestore o PostgreSQL.
* **Local (Offline-First):** SQLite (vía `@capacitor-community/sqlite` en móvil y SQLite integrado en Tauri) o IndexedDB (en Web vía `idb` / persistencia de Firestore).
* **Regla de Persistencia y Sincronización:**
  * Los módulos de negocio nunca acceden directamente a la base de datos; reciben una interfaz `IStorageAdapter` inyectada.
  * **Flujo Local-First:** La UI siempre lee y escribe primero contra el `IStorageAdapter` local para garantizar latencia cero en mostrador. La sincronización hacia la nube ocurre en segundo plano mediante una cola de mutaciones (*Outbox pattern*), sin bloquear nunca el cobro ni la operación.

---

## 3. Manejo de Periféricos y Hardware Comercial

1. **Impresoras Térmicas (Tickets / Comandas / Cortes X y Z):**
   * La generación del documento se realiza mediante un generador de comandos **ESC/POS** agnóstico que devuelve un `Uint8Array`.
   * El envío del array binario se delega al `IPrinterAdapter` de la plataforma:
     * Web: Web Bluetooth o Web Serial.
     * Móvil: Plugin Bluetooth LE de Capacitor.
     * Escritorio: Spooler de Windows o escritura en descriptor de archivo Linux (`/dev/usb/lp*`).
   * **Resiliencia de Impresión:** Todo trabajo de impresión debe registrarse con estado (`PENDING`, `PRINTED`, `FAILED`) para permitir reimpresión inmediata ante falta de papel o desconexión Bluetooth sin repetir la transacción financiera.
2. **Cajón de Dinero:**
   * Se abre mediante el pulso estándar ESC/POS enviado a través del puerto de la impresora térmica conectada vía RJ11.
3. **Lectores de Código de Barras y Básculas:**
   * En terminales fijas: Lectores tratados como entrada de teclado estándar (emulación HID con detección por velocidad de tecleo y sufijo `Enter`). Básculas leídas vía puerto serial (`WebSerial` / `Tauri Serial`).
   * En celulares/tablets móviles: Escáner nativo por cámara con ML Kit.

---

## 4. Convenciones de Carpetas para Módulos Reutilizables

Todo paquete de dominio nuevo debe seguir esta estructura interna:

```text
packages/core-nombre-modulo/
├── src/
│   ├── contracts/        # Interfaces de adaptadores (IStorageAdapter, ISecurityGuard, etc.)
│   ├── schemas/          # Esquemas Zod (con schemaVersion) y tipos TypeScript derivados
│   ├── domain/           # Funciones puras de cálculo (en centavos), máquinas de estado y reglas
│   └── index.ts          # Punto de entrada público (API limpia 100% agnóstica a React)
├── tests/                # Pruebas unitarias de casos de éxito, bordes y errores (Vitest)
├── package.json
└── README.md             # Contrato de uso, feature flags disponibles y ejemplos de integración
```

*(Los hooks reactivos correspondientes se exportan desde `packages/react-bindings/src/<modulo>/` o bajo el subpath `@modulos/<modulo>/react`, nunca mezclados en el `index.ts` raíz del dominio).*

---

## 5. Instrucciones Directas para el Agente: Creación de Módulos

Cuando se te pida crear o modificar código dentro de `@modulos/*`:

1. **Modela primero con Zod:** Define los esquemas con `schemaVersion` y los tipos inferidos antes de escribir lógica.
2. **Parametriza la complejidad:** Expón banderas de configuración (`FeatureFlags`) e interfaces segregadas para que el mismo módulo sirva a clientes básicos (cobro simple) y avanzados (arqueo ciego, denominaciones, permisos).
3. **Aísla la plataforma:** Prohibido usar `window`, `document`, `localStorage`, `navigator` o imports de React dentro de `packages/core-*`. Usa siempre inyección de adaptadores.
4. **Cubre casos límite con Vitest:** Escribe pruebas para redondeos de centavos, cambios de estado inválidos, turnos suspendidos y entradas corruptas.

---

## 6. Protocolo de Consumo de Módulos en Nuevas Apps (Hooks-First)

Cuando se te pida construir una vista, pantalla o flujo en una aplicación cliente que involucre un módulo ya existente (ej. Caja, Inventario, Periféricos, Permisos):

1. **PROHIBIDO reinventar la lógica de negocio en la UI:**
   * No crees `useState`, `useReducer` ni `useEffect` manuales para calcular totales, impuestos, cambio, cortes de caja, diferencias de stock o validaciones de turno. Toda esa lógica ya vive certificada dentro del módulo.

2. **Flujo de Trabajo Obligatorio de 3 Pasos:**
   * **Paso 1 (Adaptadores):** Verifica o implementa los contratos concretos que pide el módulo para esa plataforma (ej. `SqliteCashAdapter`, `FirestoreSyncAdapter`, `TauriPrinterAdapter`).
   * **Paso 2 (Hook Orquestador):** Importa y ejecuta el hook del módulo en la vista o proveedor correspondiente (`useCashRegister`, `useInventory`, `useBarcodeScanner`) pasándole los adaptadores y la configuración (`FeatureFlags`) requerida por el cliente.
   * **Paso 3 (UI / Tailwind):** Céntrate al 100% en maquetar los componentes visuales (formularios, modales, alertas, tablas densas, botones táctiles) y conéctalos directamente a los estados (`isLoading`, `error`, `data`) y acciones (`openShift`, `registerSale`, `resumeShift`) que el hook entrega limpios y tipados.

3. **Estándar Visual de Mostrador:** En Tailwind, diseña priorizando ergonomía táctil y velocidad operativa (áreas de toque mínimas de 44x44px, retroalimentación visual `active:scale-95`, alto contraste y atajos de teclado para operación sin ratón en escritorio).

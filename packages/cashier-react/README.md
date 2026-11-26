# @modulos/cashier-react

Adaptador reactivo y conjunto de hooks en React / React Native para conectar fácilmente la lógica de dominio de [`@modulos/core-cashier`](../core-cashier) a aplicaciones web, tablets de punto de venta (POS) y terminales móviles.

---

## 🚀 Características

- **Totalmente Reactivo**: Refresco automático del estado de gaveta, efectivo esperado y métricas financieras tras cada operación.
- **Hook `useShift`**: Lectura en tiempo real del turno activo, saldo esperado formateado, inventario de denominaciones en gaveta, alertas de exceso de efectivo (`isCashLimitExceeded`) y estados (`isOpen`, `isSuspended`, `isLocked`, `isClosed`).
- **Hook `useCashier`**: Dispatcher de operaciones con manejo nativo de `isSubmitting` y `error`:
  - `openShift`: Apertura con fondo inicial y desglose de billetes/monedas.
  - `recordPayment`: Cobros simples, pagos mixtos (Split Payment) con derivación automática de efectivo y vuelto.
  - `calculateLiveChange`: Cálculo instantáneo de cambio en vivo en formularios de caja antes de enviar.
  - `calculateOptimalChange`: Sugerencia de billetes y monedas físicos a entregar al cliente.
  - `safeDrop`: Remesas parciales a caja fuerte.
  - `suspendShift` / `resumeShift`: Pausas por colación o descanso.
  - `lockTerminal` / `unlockTerminal`: Bloqueos de seguridad.
  - `auditCount`: Arqueos intermedios o ciegos (Blind Count).
  - `closeShift`: Cierre definitivo con conciliación y firma de supervisor.
- **Compatible con Web y React Native**: Sin dependencias de navegador ni DOM; compatible con React Native, Expo, Next.js, Vite, Electron, etc.

---

## 📦 Instalación

```bash
# Vía pnpm
pnpm add @modulos/cashier-react @modulos/core-cashier

# Vía npm
npm install @modulos/cashier-react @modulos/core-cashier
```

---

## 🛠️ Guía Rápida

### 1. Configurar el `<CashierProvider>`

Envolvemos la aplicación o pantalla del módulo de caja con el `CashierProvider` (pasando repositorios persistentes o `InMemory` ya inicializados con las cajas registradas):

```tsx
import React from 'react';
import {
  CashierProvider,
  CashRegister,
  InMemoryCashRegisterRepository,
} from '@modulos/cashier-react';

const registerRepo = new InMemoryCashRegisterRepository();
registerRepo.save(
  new CashRegister({ id: 'caja-mostrador-01', name: 'Mostrador', currency: 'USD' })
);

export function App() {
  return (
    <CashierProvider
      registerRepo={registerRepo}
      defaultRegisterId="caja-mostrador-01"
      options={{ discrepancyTolerance: 5 }}
    >
      <PuntoDeVentaScreen />
    </CashierProvider>
  );
}
```

---

### 2. Formulario de Cobro con Vuelto en Vivo

```tsx
import React, { useState } from 'react';
import { useCashier, useShift, PaymentMethod } from '@modulos/cashier-react';

export function CobroForm({ ticketTotal }: { ticketTotal: number }) {
  const { expectedCashFormatted, isCashLimitExceeded } = useShift();
  const { recordPayment, calculateLiveChange, isSubmitting, error } = useCashier();

  const [cardAmount, setCardAmount] = useState<number>(200);
  const [tenderedCash, setTenderedCash] = useState<number>(500);

  // Cálculo en vivo del vuelto sin requerir lógica manual
  const { cashRequired, changeGiven } = calculateLiveChange(ticketTotal, cardAmount, tenderedCash);

  const handleCobrar = async () => {
    await recordPayment({
      transactionReference: 'TICKET-10492',
      ticketTotal,
      payments: [
        { id: 'pay-card', method: PaymentMethod.CREDIT_CARD, amount: cardAmount },
      ],
      tenderedCash,
      performedBy: { id: 'usr-1', name: 'Laura Gómez' },
    });
    alert(`¡Cobro exitoso! Entregar vuelto: $${changeGiven.toFixed(2)}`);
  };

  return (
    <div>
      <h3>Saldo actual en gaveta: {expectedCashFormatted}</h3>
      {isCashLimitExceeded && (
        <div style={{ color: 'red' }}>
          ⚠️ Límite de efectivo superado. Realice un SAFE_DROP a la caja fuerte.
        </div>
      )}

      <div>Total Ticket: ${ticketTotal}</div>
      <div>Monto Tarjeta: ${cardAmount}</div>
      <div>Efectivo Requerido: ${cashRequired}</div>
      <div>Cliente Entrega en Efectivo: ${tenderedCash}</div>
      <div><strong>Vuelto a Devolver: ${changeGiven}</strong></div>

      <button onClick={handleCobrar} disabled={isSubmitting}>
        {isSubmitting ? 'Procesando...' : 'Confirmar Cobro'}
      </button>

      {error && <p style={{ color: 'red' }}>{error.message}</p>}
    </div>
  );
}
```

---

### 3. Pausar y Bloquear la Terminal

```tsx
import React from 'react';
import { useCashier, useShift } from '@modulos/cashier-react';

export function TerminalControls() {
  const { isOpen, isSuspended, isLocked } = useShift();
  const { suspendShift, resumeShift, lockTerminal, unlockTerminal } = useCashier();

  if (isSuspended) {
    return (
      <div>
        <p>Turno en pausa (Colación)</p>
        <button onClick={() => resumeShift()}>Reanudar Turno</button>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div>
        <p>🔒 Terminal Bloqueada</p>
        <button onClick={() => unlockTerminal()}>Desbloquear</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => suspendShift('Salida a colación')}>Pausar Turno</button>
      <button onClick={() => lockTerminal('Bloqueo de seguridad')}>Bloquear Pantalla</button>
    </div>
  );
}
```

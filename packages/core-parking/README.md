# `@modulos/core-parking`

Módulo agnóstico de dominio puro (Headless) para gestión de estacionamiento público:
- Cajones (`AVAILABLE` / `OCCUPIED`)
- Registro de entradas y salidas (`checkInVehicle`, `checkOutVehicle`)
- Cálculo de tarifa por hora o fracción en centavos (`calculateParkingFee`)
- Resumen de ticket listo para cobro en `@modulos/core-cashier` e impresión térmica ESC/POS

## Uso básico

```ts
import { InMemoryParkingStorage, ParkingLotService } from "@modulos/core-parking";

const storage = new InMemoryParkingStorage({
  spots: [{ code: "A1" }, { code: "A2" }],
  hourlyRateCents: 2000,
});

const parking = new ParkingLotService(storage);
```

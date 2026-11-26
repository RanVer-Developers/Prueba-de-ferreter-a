# `@modulos/core-logistics`

Módulo de dominio puro (*headless*) para gestión de logística y entregas en aplicaciones de comercio electrónico, POS y última milla.

## Capacidades

- **Envíos y Tracking (`Shipment`)**: Máquina de estados (`PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED / FAILED / RETURNED / CANCELLED`), historial de eventos de seguimiento, idempotencia y concurrencia optimista (`version`).
- **Cotización de Tarifas (`ShippingRateService`)**: Cálculo exacto en centavos (`Money` de `@modulos/core-shared`) con estrategias `FLAT`, `ZONE`, `DISTANCE` y `WEIGHT` (incluyendo peso volumétrico y umbral de envío gratis).
- **Repartidores y Rutas (`Driver`, `DeliveryRoute`)**: Control de disponibilidad (`AVAILABLE`, `ON_ROUTE`, `OFFLINE`), validación opcional de capacidad por paquetes/peso, y gestión de rutas con paradas ordenadas.
- **Prueba de Entrega (POD) y Reintentos**: Registro de receptor, firma/foto de referencia, verificación por PIN y control de intentos fallidos.

## Feature Flags (`LogisticsFeatureFlags`)

| Bandera | Default | Descripción |
| :--- | :--- | :--- |
| `enableZoneRates` | `true` | Habilita cotización por zona (`ZONE`). |
| `enableDistanceRates` | `true` | Habilita cotización por distancia (`DISTANCE`). |
| `enableWeightRates` | `true` | Habilita cotización por peso físico/volumétrico (`WEIGHT`). |
| `enableFreeShippingThreshold` | `true` | Aplica envío gratis al superar `freeShippingThresholdCents`. |
| `requireProofOfDelivery` | `false` | Exige `signatureRef` o `photoRef` para completar entrega. |
| `requireDeliveryPin` | `false` | Exige PIN de verificación coincidente al entregar. |
| `maxDeliveryAttempts` | `3` | Política numérica: límite máximo de intentos fallidos permitidos (separable vía `splitLogisticsFeatures`). |
| `allowReturnFromFailed` | `true` | Permite pasar de `FAILED` a `RETURNED`. |
| `enforceDriverCapacity` | `false` | Valida `maxPackages` y `maxWeightGrams` del repartidor. |

> **Nota sobre compatibilidad:** `maxDeliveryAttempts` permanece dentro de `LogisticsFeatureFlagsSchema` para mantener compatibilidad hacia atrás. Para consumir únicamente las flags booleanas (`LogisticsBooleanFeatureFlags`) y la política numérica (`LogisticsPolicyConfig`) por separado, utiliza `splitLogisticsFeatures(flags)` y `composeLogisticsFeatures(features, policy)`.

## Ejemplo de Integración

```ts
import {
  InMemoryShipmentRepository,
  CreateShipmentUseCase,
  ShippingRateService,
} from '@modulos/core-logistics';

const quote = ShippingRateService.quote(
  {
    schemaVersion: 1,
    id: 'rate-local',
    name: 'Local Zone',
    currency: 'MXN',
    strategy: 'ZONE',
    baseFeeCents: 2000,
    zoneRates: [{ zoneCode: 'CENTRO', feeCents: 3500 }],
    freeShippingThresholdCents: 100000,
    includedKm: 0,
    volumetricDivisor: 5000,
    active: true,
  },
  {
    currency: 'MXN',
    orderSubtotalCents: 45000,
    zoneCode: 'CENTRO',
    packages: [{ id: 'pkg-1', weightGrams: 1200, quantity: 1, fragile: false }],
  }
);

const repo = new InMemoryShipmentRepository();
const createShipment = new CreateShipmentUseCase(repo);
const shipment = await createShipment.execute({
  orderId: 'ord-100',
  origin: { recipientName: 'Bodega', street: 'Av. 1', city: 'CDMX', country: 'MX' },
  destination: { recipientName: 'Ana', street: 'Calle 2', city: 'CDMX', country: 'MX', zoneCode: 'CENTRO' },
  packages: [{ id: 'pkg-1', weightGrams: 1200, quantity: 1, fragile: false }],
  shippingFee: quote.amount.toJSON(),
});
```

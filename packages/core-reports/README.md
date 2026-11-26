# `@modulos/core-reports`

Módulo agnóstico de dominio puro (Headless / DDD) para **Reportes y Analítica Comercial**.

## Características

- **100% Headless y Multiplataforma:** Cero dependencias de React, DOM, `fetch` o almacenamiento concreto. Toda fuente de datos y entrega de archivos se inyecta mediante puertos (`IReportDataSource`, `IReportExporter`, `IReportClock`).
- **Aritmética Monetaria Exacta:** Todos los montos operan en centavos enteros seguros (`SafeInteger`) y los porcentajes/márgenes se expresan en *basis points* (`bps`, `10000 = 100.00%`) con redondeo bancario `ROUND_HALF_EVEN` de `@modulos/core-shared`.
- **Contratos Versionados:** Esquemas Zod estrictos con `schemaVersion: 1`.
- **Parametrización por `ReportTier`:**
  - `BASIC`: Resumen de ventas, ticket promedio, desglose por método de pago y top productos.
  - `INTERMEDIATE`: Series temporales (`HOUR`, `DAY`, `WEEK`, `MONTH`) con offset de zona horaria, desglose por categoría/canal/sucursal, rentabilidad (COGS, utilidad bruta, margen en bps), comparación entre períodos, exportación y definiciones guardadas.
  - `ADVANCED`: Clasificación ABC Pareto de inventario (`REVENUE`, `PROFIT`, `VALUATION`) y analítica de clientes (clientes únicos, tasa de recompra, LTV promedio en el período).
- **Exportación Segura:** Generación pura de CSV (RFC 4180) con mitigación contra *CSV Formula Injection* (`=`, `+`, `-`, `@`) y JSON estructurado.

## Uso rápido

```ts
import {
  GenerateSalesReportUseCase,
  resolveReportFeatures,
} from '@modulos/core-reports';

const useCase = new GenerateSalesReportUseCase(myDataSource);

const summary = await useCase.generateSummary({
  period: {
    from: '2026-11-01T00:00:00Z',
    to: '2026-11-30T23:59:59Z',
    granularity: 'DAY',
    timezoneOffsetMinutes: -360,
  },
  filter: {
    currency: 'MXN',
    includeVoided: false,
    includeRefunded: true,
    topLimit: 20,
  },
  profile: resolveReportFeatures('INTERMEDIATE'),
});
```

## Scripts

```bash
pnpm build
pnpm typecheck
pnpm test
```

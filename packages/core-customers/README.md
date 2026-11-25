# `@modulos/core-customers`

Módulo headless de dominio puro para gestión de clientes, perfiles fiscales, crédito comercial (CxC / fiado), monedero prepagado, programa de lealtad por puntos y anonimización GDPR.

## Perfiles de Feature Flags (`CustomerTier`)
- `BASIC`: Directorio base con concurrencia optimista e idempotencia offline.
- `INTERMEDIATE`: Agrega tipos (`INDIVIDUAL`/`BUSINESS`) y perfiles fiscales, múltiples direcciones, segmentos/etiquetas, cuentas de crédito, monedero prepagado, puntos de lealtad y anonimización PII.
- `ADVANCED`: Agrega análisis de cartera vencida y bloqueos por mora (`creditAgingAndHolds`), niveles de lealtad con multiplicadores (`loyaltyTiers`) y expiración FIFO de puntos (`loyaltyExpiration`).

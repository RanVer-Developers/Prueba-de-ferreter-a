# `@modulos/core-catalog`

Módulo headless de dominio puro para catálogo maestro de productos y servicios (`PHYSICAL`, `SERVICE`, `DIGITAL`, `BUNDLE`), categorías jerárquicas, variantes, modificadores/extras, visibilidad multicanal, listas de precios por volumen/segmento y motor de promociones.

## Perfiles de Feature Flags (`CatalogTier`)
- `BASIC`: Catálogo simple por SKU/código de barras, categorías y sugerencias fiscales (`taxProfileHints`).
- `INTERMEDIATE`: Agrega variantes, modificadores/extras, combos (`bundlesAndKits`), visibilidad multicanal, múltiples códigos de barras, listas de precios y promociones.
- `ADVANCED`: Habilita todas las funciones incluyendo precios escalonados por volumen (`volumeTierPricing`).

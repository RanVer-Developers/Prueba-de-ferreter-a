# @modulos/core-purchasing

Módulo headless de dominio para **Compras y Proveedores**: gestión de proveedores, catálogo proveedor-producto, órdenes de compra, recepción de mercancía con factura, actualización de costos, devoluciones a proveedor y cuentas por pagar.

## Principios de Diseño
- **Headless:** Cero dependencias de React, navegador o bases de datos concretas.
- **Desacoplado de otros `core-*`:** No importa `@modulos/core-inventory` ni `@modulos/core-catalog`. La aplicación anfitriona conecta `IInventoryReceivingPort`, `IInventoryReturnPort` e `ICatalogCostUpdaterPort`.
- **Aritmética en centavos:** Todos los montos operan en enteros mínimos (centavos) con redondeo `ROUND_HALF_EVEN` vía `@modulos/core-shared`.
- **Contratos versionados:** Todas las entidades persistibles incluyen `schemaVersion: 1` validado con Zod.

## Feature Flags (`PurchasingTier`: `BASIC` | `INTERMEDIATE` | `ADVANCED`)
- `directPurchaseWithoutPO`: Permite registrar entradas con factura sin orden de compra previa.
- `requirePOApproval`: Exige `DRAFT -> APPROVED -> SENT` antes de poder recibir mercancía.
- `allowOverReceiving`: Permite recibir más unidades de las solicitadas en la OC.
- `autoUpdateCatalogCost`: Notifica a `ICatalogCostUpdaterPort` al recibir factura.
- `accountsPayable`: Genera automáticamente `SupplierPayable` para proveedores a crédito.
- `enforceCreditLimit`: Bloquea recepciones a crédito si superan `creditLimitCents` del proveedor.
- `fractionalQuantities`: Habilita cantidades decimales (kg, litros).

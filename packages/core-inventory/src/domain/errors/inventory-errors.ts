/**
 * Error base para todas las excepciones del dominio de inventario.
 */
export class InventoryDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NegativeStockNotAllowedError extends InventoryDomainError {
  constructor(itemId: string, warehouseId: string, currentStock: number, requestedDeduction: number) {
    super(
      `No se permite stock negativo para el item '${itemId}' en almacén '${warehouseId}'. Stock actual: ${currentStock}, deducción: ${requestedDeduction}.`
    );
  }
}

export class InsufficientStockError extends InventoryDomainError {
  constructor(itemId: string, warehouseId: string, available: number, requested: number) {
    super(
      `Stock insuficiente para el item '${itemId}' en almacén '${warehouseId}'. Disponible: ${available}, solicitado: ${requested}.`
    );
  }
}

export class ItemNotFoundError extends InventoryDomainError {
  constructor(identifier: string) {
    super(`El artículo de inventario con identificador '${identifier}' no existe.`);
  }
}

export class WarehouseNotFoundError extends InventoryDomainError {
  constructor(warehouseId: string) {
    super(`El almacén con identificador '${warehouseId}' no fue encontrado.`);
  }
}

export class WarehouseInactiveError extends InventoryDomainError {
  constructor(warehouseId: string) {
    super(`El almacén '${warehouseId}' se encuentra inactivo y no admite operaciones.`);
  }
}

export class InvalidQuantityError extends InventoryDomainError {
  constructor(value: number, reason: string) {
    super(`Cantidad inválida (${value}): ${reason}`);
  }
}

export class InvalidMoneyAmountError extends InventoryDomainError {
  constructor(value: number, reason: string) {
    super(`Monto monetario inválido (${value}): ${reason}`);
  }
}

export class CurrencyMismatchError extends InventoryDomainError {
  constructor(expected: string, received: string) {
    super(`Discrepancia de moneda: se esperaba '${expected}', pero se recibió '${received}'.`);
  }
}

export class UnitOfMeasureMismatchError extends InventoryDomainError {
  constructor(fromUom: string, toUom: string) {
    super(`No es posible operar o convertir entre las unidades de medida '${fromUom}' y '${toUom}'.`);
  }
}

export class LotExpiredError extends InventoryDomainError {
  constructor(lotNumber: string, expirationDate: Date) {
    super(`El lote '${lotNumber}' venció el ${expirationDate.toISOString()} y no puede ser despachado.`);
  }
}

export class LotNotFoundError extends InventoryDomainError {
  constructor(lotNumber: string, itemId: string) {
    super(`El lote '${lotNumber}' no existe para el artículo '${itemId}'.`);
  }
}

export class SerialNumberNotFoundError extends InventoryDomainError {
  constructor(serialNumber: string, itemId: string) {
    super(`El número de serie '${serialNumber}' no existe para el artículo '${itemId}'.`);
  }
}

export class DuplicateSerialNumberError extends InventoryDomainError {
  constructor(serialNumber: string, itemId: string) {
    super(`El número de serie '${serialNumber}' ya se encuentra registrado para el artículo '${itemId}'.`);
  }
}

export class InvalidSerialNumberStateError extends InventoryDomainError {
  constructor(serialNumber: string, currentState: string, expectedState: string) {
    super(
      `El número de serie '${serialNumber}' se encuentra en estado '${currentState}', pero se requería '${expectedState}'.`
    );
  }
}

export class InvalidTransferStateError extends InventoryDomainError {
  constructor(transferId: string, currentState: string, operation: string) {
    super(`No se puede ejecutar '${operation}' en el traslado '${transferId}' con estado '${currentState}'.`);
  }
}

export class TransferMismatchError extends InventoryDomainError {
  constructor(transferId: string, sent: number, received: number) {
    super(`Discrepancia en traslado '${transferId}': enviados ${sent}, recibidos ${received}.`);
  }
}

export class ReservationExpiredError extends InventoryDomainError {
  constructor(reservationId: string, expiresAt: Date) {
    super(`La reserva de stock '${reservationId}' expiró el ${expiresAt.toISOString()}.`);
  }
}

export class ReservationNotFoundError extends InventoryDomainError {
  constructor(reservationId: string) {
    super(`La reserva de stock '${reservationId}' no fue encontrada.`);
  }
}

export class InventoryCountClosedError extends InventoryDomainError {
  constructor(countId: string) {
    super(`La sesión de conteo físico '${countId}' ya está cerrada y no admite más registros.`);
  }
}

export class SelfApprovalNotAllowedError extends InventoryDomainError {
  constructor(userId: string, action: string) {
    super(`Control interno: el usuario '${userId}' no puede autoaprobar su propia operación de '${action}'.`);
  }
}

export class InsufficientRoleError extends InventoryDomainError {
  constructor(requiredRoles: string[], currentRole: string) {
    super(
      `Permisos insuficientes: se requiere uno de los roles [${requiredRoles.join(', ')}], pero el usuario posee '${currentRole}'.`
    );
  }
}

export class ConcurrencyError extends InventoryDomainError {
  constructor(entityId: string, expectedVersion: number, currentVersion: number) {
    super(
      `Conflicto de concurrencia en '${entityId}': versión esperada ${expectedVersion}, pero la actual es ${currentVersion}.`
    );
  }
}

export class DuplicateTransactionError extends InventoryDomainError {
  constructor(idempotencyKey: string) {
    super(`La transacción con clave de idempotencia '${idempotencyKey}' ya fue procesada anteriormente.`);
  }
}

export class ReceivingOrderNotFoundError extends InventoryDomainError {
  constructor(orderId: string) {
    super(`La orden de recepción '${orderId}' no fue encontrada.`);
  }
}

export class InvalidReceivingOrderStateError extends InventoryDomainError {
  constructor(orderId: string, currentState: string, action: string) {
    super(`No se puede ejecutar '${action}' en la orden de recepción '${orderId}' en estado '${currentState}'.`);
  }
}

export class ReceivingOverdeliveryError extends InventoryDomainError {
  constructor(orderId: string, itemId: string, pending: number, received: number) {
    super(
      `Sobredespacho no permitido para item '${itemId}' en orden '${orderId}': pendientes ${pending}, recibidos en entrega ${received}.`
    );
  }
}

export class BreakPackRatioError extends InventoryDomainError {
  constructor(reason: string) {
    super(`Error en desempaque/break-pack: ${reason}`);
  }
}

export class InvalidBinLocationError extends InventoryDomainError {
  constructor(reason: string) {
    super(`Ubicación física de almacén (Bin) inválida: ${reason}`);
  }
}

export class FeatureDisabledError extends InventoryDomainError {
  constructor(feature: string, details?: string) {
    super(
      details
        ? `La funcionalidad de inventario '${feature}' está deshabilitada en el perfil actual: ${details}`
        : `La funcionalidad de inventario '${feature}' está deshabilitada en el perfil actual.`
    );
  }
}

export class SchemaValidationError extends InventoryDomainError {
  constructor(entity: string, reason: string) {
    super(`Error de validación de esquema en '${entity}': ${reason}`);
  }
}

export class TransferNotFoundError extends InventoryDomainError {
  constructor(transferId: string) {
    super(`El traslado '${transferId}' no fue encontrado.`);
  }
}

export class CompositeProductNotFoundError extends InventoryDomainError {
  constructor(identifier: string) {
    super(`El producto compuesto (BOM/Combo) '${identifier}' no fue encontrado.`);
  }
}

export class BinLocationNotFoundError extends InventoryDomainError {
  constructor(code: string, itemId: string, warehouseId: string) {
    super(`La ubicación '${code}' no está asignada al artículo '${itemId}' en el almacén '${warehouseId}'.`);
  }
}

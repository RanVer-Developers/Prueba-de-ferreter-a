export abstract class CashierDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CashRegisterNotFoundError extends CashierDomainError {
  constructor(public readonly cashRegisterId: string) {
    super(`No se encontró la caja con ID "${cashRegisterId}".`);
  }
}

export class CashRegisterAlreadyOpenError extends CashierDomainError {
  constructor(public readonly cashRegisterId: string, public readonly activeShiftId: string) {
    super(`La caja "${cashRegisterId}" ya tiene un turno abierto (ID: "${activeShiftId}").`);
  }
}

export class CashRegisterNotOpenError extends CashierDomainError {
  constructor(public readonly cashRegisterId: string) {
    super(`La caja "${cashRegisterId}" no tiene un turno activo.`);
  }
}

export class ShiftNotFoundError extends CashierDomainError {
  constructor(public readonly shiftId: string) {
    super(`No se encontró el turno con ID "${shiftId}".`);
  }
}

export class InvalidShiftStatusError extends CashierDomainError {
  constructor(public readonly shiftId: string, public readonly currentStatus: string, public readonly expectedStatus: string) {
    super(`El turno "${shiftId}" está en estado "${currentStatus}", pero se esperaba "${expectedStatus}".`);
  }
}

export class InsufficientCashInDrawerError extends CashierDomainError {
  constructor(public readonly requested: number, public readonly available: number, public readonly currency: string) {
    super(`Saldo insuficiente en caja: se intentó retirar ${requested} ${currency}, pero solo hay ${available} ${currency} disponibles en efectivo.`);
  }
}

export class InsufficientChangeDenominationsError extends CashierDomainError {
  constructor(public readonly requestedChange: number, public readonly currency: string, public readonly details?: string) {
    super(`No es posible entregar el cambio exacto de ${requestedChange} ${currency} con el desglose físico disponible en gaveta.${details ? ` ${details}` : ''}`);
  }
}

export class DuplicateTransactionError extends CashierDomainError {
  constructor(public readonly idempotencyKey: string) {
    super(`Transacción duplicada detectada: la clave de idempotencia "${idempotencyKey}" ya ha sido procesada previamente.`);
  }
}

export class CashierLockedError extends CashierDomainError {
  constructor(public readonly shiftId: string, public readonly reason?: string) {
    super(`El turno "${shiftId}" se encuentra bloqueado / suspendido.${reason ? ` Motivo: ${reason}` : ''}`);
  }
}

export class InvalidMoneyAmountError extends CashierDomainError {
  constructor(public readonly amount: number, details?: string) {
    super(`Monto inválido: ${amount}.${details ? ` ${details}` : ''}`);
  }
}

export class CurrencyMismatchError extends CashierDomainError {
  constructor(public readonly expectedCurrency: string, public readonly actualCurrency: string) {
    super(`Discrepancia de monedas: no se puede operar ${actualCurrency} con ${expectedCurrency}.`);
  }
}

export class InvalidDenominationQuantityError extends CashierDomainError {
  constructor(public readonly denomination: number, public readonly count: number) {
    super(`La cantidad de la denominación ${denomination} debe ser un entero positivo o cero, pero se recibió ${count}.`);
  }
}

export class InvalidPaymentError extends CashierDomainError {
  constructor(message: string) {
    super(message);
  }
}

export class UnauthorizedVoidError extends CashierDomainError {
  constructor(public readonly movementId: string, details?: string) {
    super(`Anulación no autorizada para el movimiento "${movementId}": se requiere aprobación explícita de un supervisor.${details ? ` ${details}` : ''}`);
  }
}

export class CrossMethodRefundDisallowedError extends CashierDomainError {
  constructor(public readonly requestedMethod: string, public readonly originalMethod: string) {
    super(`Regla antifraude: no está permitido reembolsar en ${requestedMethod} transacciones cobradas originalmente con ${originalMethod}.`);
  }
}

export class MovementAlreadyVoidedError extends CashierDomainError {
  constructor(public readonly movementId: string) {
    super(`El movimiento "${movementId}" ya ha sido anulado previamente.`);
  }
}

export class SelfApprovalNotAllowedError extends CashierDomainError {
  constructor(public readonly userId: string, public readonly action: string) {
    super(`Control interno: el usuario "${userId}" no puede autorizar su propia operación (${action}). Se requiere un segundo usuario.`);
  }
}

export class InsufficientRoleError extends CashierDomainError {
  constructor(public readonly userId: string, public readonly action: string, public readonly role?: string) {
    super(`El usuario "${userId}"${role ? ` con rol "${role}"` : ' sin rol asignado'} no tiene permisos de supervisor para autorizar: ${action}.`);
  }
}

export class SupervisorApprovalRequiredError extends CashierDomainError {
  constructor(public readonly action: string, details?: string) {
    super(`Se requiere aprobación de un supervisor para: ${action}.${details ? ` ${details}` : ''}`);
  }
}

export class InvalidSignatureError extends CashierDomainError {
  constructor(public readonly supervisorId: string) {
    super(`La firma digital del supervisor "${supervisorId}" no es válida para esta operación.`);
  }
}

export class InvalidVoidTargetError extends CashierDomainError {
  constructor(public readonly movementId: string, details: string) {
    super(`No se puede anular el movimiento "${movementId}": ${details}`);
  }
}

export class MovementNotFoundError extends CashierDomainError {
  constructor(public readonly movementId: string, public readonly shiftId: string) {
    super(`No se encontró el movimiento con ID "${movementId}" en el turno "${shiftId}".`);
  }
}

export class OriginalSaleNotFoundError extends CashierDomainError {
  constructor(public readonly referenceId?: string) {
    super(`No se encontró una venta original registrada${referenceId ? ` para la referencia "${referenceId}"` : ''}; el reembolso debe estar vinculado a una venta.`);
  }
}

export class RefundExceedsOriginalSaleError extends CashierDomainError {
  constructor(
    public readonly referenceId: string,
    public readonly requested: number,
    public readonly refundable: number,
    public readonly currency: string,
    public readonly method?: string
  ) {
    super(`El reembolso de ${requested} ${currency}${method ? ` en ${method}` : ''} excede lo reembolsable de la venta "${referenceId}" (${refundable} ${currency}).`);
  }
}

export class ConcurrencyError extends CashierDomainError {
  constructor(public readonly entityId: string, public readonly expectedVersion: number, public readonly actualVersion: number) {
    super(`Conflicto de concurrencia en "${entityId}": se esperaba la versión ${expectedVersion} pero el almacén tiene la ${actualVersion}. Recargue y reintente.`);
  }
}

export class ReportNotAvailableError extends CashierDomainError {
  constructor(public readonly shiftId: string, details: string) {
    super(`Reporte no disponible para el turno "${shiftId}": ${details}`);
  }
}

export class InvalidCashierInputError extends CashierDomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidCashRegisterStatusError extends CashierDomainError {
  constructor(public readonly cashRegisterId: string, public readonly currentStatus: string, details?: string) {
    super(`La caja "${cashRegisterId}" se encuentra en estado "${currentStatus}" y no puede operar.${details ? ` ${details}` : ''}`);
  }
}

export class FeatureDisabledError extends CashierDomainError {
  constructor(public readonly feature: string, details?: string) {
    super(`La funcionalidad "${feature}" no está habilitada en el perfil actual de caja.${details ? ` ${details}` : ''}`);
  }
}

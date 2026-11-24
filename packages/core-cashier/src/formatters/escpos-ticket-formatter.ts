import { ShiftReportData } from '../domain/entities/audit-report.js';
import { CashMovement, MovementType } from '../domain/entities/cash-movement.js';
import { HandoverRecord } from '../domain/entities/cash-shift.js';
import {
  assertFeatureEnabled,
  CashierFeatureFlags,
  CashierFeatureProfile,
  resolveCashierFeatures,
} from '../domain/services/cashier-features.js';
import { currencyDecimals } from '../domain/value-objects/money.js';
import { PaymentResult } from '../use-cases/record-payment.use-case.js';

export interface EscPosOptions {
  columnWidth?: 32 | 42 | 48; // 32 para 58mm estándar, 42/48 para 80mm
  storeName?: string;
  storeAddress?: string;
  storeTaxId?: string;       // RFC, RUT, CIF, NIF
  openCashDrawer?: boolean;  // Enviar comando para abrir cajón de dinero al imprimir
  cutPaper?: boolean;        // Enviar comando de corte de papel al final
  isReprintCopy?: boolean;   // Marca el ticket como *** COPIA / REIMPRESIÓN ***
  footerMessage?: string;    // Mensaje personalizado al pie del ticket
  features?: CashierFeatureProfile;
}

/**
 * Genera comandos binarios ESC/POS estándar (GS ( k) para imprimir un código QR en impresora térmica.
 */
export function buildEscPosQrCodeBytes(
  payload: string,
  moduleSize = 5,
  options: { features?: CashierFeatureProfile } = {}
): Uint8Array {
  const features = resolveCashierFeatures(options.features);
  assertFeatureEnabled(features, 'escPosQrCodes');
  const data = encodeTextCP858(payload);
  const sizeByte = Math.max(1, Math.min(16, Math.trunc(moduleSize)));
  const storeLen = data.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;

  const modelCmd = [0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00];
  const sizeCmd = [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, sizeByte];
  const eccCmd = [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]; // Level M
  const storeHeader = [0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30];
  const printCmd = [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30];

  const out = new Uint8Array(
    modelCmd.length + sizeCmd.length + eccCmd.length + storeHeader.length + data.length + printCmd.length
  );
  let offset = 0;
  for (const part of [modelCmd, sizeCmd, eccCmd, storeHeader]) {
    out.set(part, offset);
    offset += part.length;
  }
  out.set(data, offset);
  offset += data.length;
  out.set(printCmd, offset);
  return out;
}

/**
 * Constantes de comandos ESC/POS estándares compatibles con Epson, Star, Bixolon, etc.
 */
export const ESC_POS_COMMANDS = {
  INIT: '\x1b\x40',                        // ESC @ (Inicializar impresora)
  SELECT_CODEPAGE_CP858: '\x1b\x74\x13',   // ESC t 19 (Tabla de caracteres CP858: Español / Europa Occidental + €)
  ALIGN_LEFT: '\x1b\x61\x00',               // ESC a 0 (Alineación izquierda)
  ALIGN_CENTER: '\x1b\x61\x01',             // ESC a 1 (Alineación centrada)
  ALIGN_RIGHT: '\x1b\x61\x02',              // ESC a 2 (Alineación derecha)
  BOLD_ON: '\x1b\x45\x01',                  // ESC E 1 (Negrita encendida)
  BOLD_OFF: '\x1b\x45\x00',                 // ESC E 0 (Negrita apagada)
  DOUBLE_HEIGHT_ON: '\x1b\x21\x10',         // Doble altura
  NORMAL_TEXT: '\x1b\x21\x00',              // Texto normal
  FEED_LINE: '\x0a',                        // LF (Salto de línea)
  OPEN_DRAWER: '\x1b\x70\x00\x19\xfa',      // ESC p 0 25 250 (Pulso apertura cajón portamonedas pin 2)
  PARTIAL_CUT: '\x1d\x56\x01',              // GS V 1 (Corte parcial)
  FULL_CUT: '\x1d\x56\x00',                 // GS V 0 (Corte total)
};

export const ESC_POS_COMMANDS_BYTES = {
  INIT: new Uint8Array([0x1b, 0x40]),
  SELECT_CODEPAGE_CP858: new Uint8Array([0x1b, 0x74, 0x13]),
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),
  DOUBLE_HEIGHT_ON: new Uint8Array([0x1b, 0x21, 0x10]),
  NORMAL_TEXT: new Uint8Array([0x1b, 0x21, 0x00]),
  FEED_LINE: new Uint8Array([0x0a]),
  OPEN_DRAWER: new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]),
  PARTIAL_CUT: new Uint8Array([0x1d, 0x56, 0x01]),
  FULL_CUT: new Uint8Array([0x1d, 0x56, 0x00]),
};

/**
 * Mapa de caracteres acentuados y símbolos del español/portugués/francés a su byte en CP858 (IBM850 + €).
 * Evita que el envío como UTF-8 corrompa acentos, eñes, signos `¡¿` o el euro.
 */
const CP858_CHAR_MAP: Readonly<Record<string, number>> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5,
  'ü': 0x81, 'Ü': 0x9a,
  '¡': 0xad, '¿': 0xa8,
  'ç': 0x87, 'Ç': 0x80,
  'ª': 0xa6, 'º': 0xa7, '°': 0xf8,
  '€': 0xd5, '¢': 0xbd, '£': 0x9c, '¥': 0xbe,
};

/**
 * Codifica texto plano en CP858 (1 byte por carácter, con acentos, eñes y signos `¡¿`).
 */
export function encodeTextCP858(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const mapped = CP858_CHAR_MAP[ch];
    if (mapped !== undefined) {
      bytes[i] = mapped;
      continue;
    }
    const code = text.charCodeAt(i);
    bytes[i] = code <= 0x7f ? code : 0x3f; // '?' si está fuera de rango
  }
  return bytes;
}


/**
 * Codifica una cadena combinada (comandos ESC/POS + texto) en `Uint8Array` sin alterar secuencias de control.
 */
export function encodeEscPosBytes(raw: string): Uint8Array {
  return encodeTextCP858(raw);
}

/**
 * Servicio de formateo y renderizado de tickets para impresoras térmicas de 58mm y 80mm.
 * Genera salida tanto en texto plano alineado como en secuencias de comandos ESC/POS (string y `Uint8Array` binario).
 */
export class EscPosTicketFormatter {
  private readonly width: number;
  private readonly options: EscPosOptions;
  private readonly features: CashierFeatureFlags;

  public constructor(options: EscPosOptions = {}) {
    this.options = options;
    this.width = options.columnWidth || 42;
    this.features = resolveCashierFeatures(options.features);
  }

  /**
   * Genera el comando ESC/POS específico para abrir el cajón portamonedas (string).
   */
  public getOpenDrawerCommand(): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    return ESC_POS_COMMANDS.OPEN_DRAWER;
  }

  /**
   * Genera los 5 bytes exactos (`1b 70 00 19 fa`) para abrir el cajón portamonedas sin corrupción UTF-8.
   */
  public getOpenDrawerCommandBytes(): Uint8Array {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    return ESC_POS_COMMANDS_BYTES.OPEN_DRAWER;
  }

  /**
   * Genera el comando de corte de papel (string).
   */
  public getCutPaperCommand(fullCut = false): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    return fullCut ? ESC_POS_COMMANDS.FULL_CUT : ESC_POS_COMMANDS.PARTIAL_CUT;
  }

  /**
   * Genera los bytes exactos del comando de corte de papel (`Uint8Array`).
   */
  public getCutPaperCommandBytes(fullCut = false): Uint8Array {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    return fullCut ? ESC_POS_COMMANDS_BYTES.FULL_CUT : ESC_POS_COMMANDS_BYTES.PARTIAL_CUT;
  }

  /**
   * Formatea un reporte de auditoría (Reporte X o Reporte Z) en texto plano monoespaciado.
   */
  public formatAuditReportPlainText(report: ShiftReportData): string {
    const lines: string[] = [];
    const div = '='.repeat(this.width);
    const subDiv = '-'.repeat(this.width);

    // Cabecera
    if (this.options.storeName) {
      lines.push(this.center(this.options.storeName));
    }
    if (this.options.storeAddress) {
      lines.push(this.center(this.options.storeAddress));
    }
    if (this.options.storeTaxId) {
      lines.push(this.center(`RUT/RFC: ${this.options.storeTaxId}`));
    }
    lines.push(div);
    lines.push(this.center(report.reportTitle));
    if (report.reportNumber !== undefined) {
      lines.push(this.center(`FOLIO ${report.reportType}: #${String(report.reportNumber).padStart(6, '0')}`));
    }
    lines.push(div);

    lines.push(this.twoColumns('FECHA EMISION:', report.generatedAt.slice(0, 19).replace('T', ' ')));
    lines.push(this.twoColumns('TURNO ID:', report.shiftId));
    lines.push(this.twoColumns('CAJA:', report.cashRegisterName || report.cashRegisterId));
    lines.push(this.twoColumns('CAJERO:', `${report.cashierName} (${report.cashierId})`));
    lines.push(this.twoColumns('APERTURA:', report.openedAt.slice(0, 19).replace('T', ' ')));
    if (report.closedAt) {
      lines.push(this.twoColumns('CIERRE:', report.closedAt.slice(0, 19).replace('T', ' ')));
    }
    lines.push(subDiv);

    // Resumen Comercial
    lines.push(this.center('RESUMEN DE VENTAS'));
    lines.push(subDiv);
    lines.push(this.twoColumns('VENTAS BRUTAS:', this.moneyStr(report.grossSales, report.currency)));
    lines.push(this.twoColumns('(-) DEVOLUCIONES:', this.moneyStr(report.refunds, report.currency)));
    lines.push(this.twoColumns('(=) VENTAS NETAS:', this.moneyStr(report.netSales, report.currency)));
    if (report.tipsCollected > 0) {
      lines.push(this.twoColumns('(+) PROPINAS RECAUDADAS:', this.moneyStr(report.tipsCollected, report.currency)));
      lines.push(this.twoColumns('(-) PROPINAS LIQUIDADAS:', this.moneyStr(report.tipsPaidOut, report.currency)));
      lines.push(this.twoColumns('(=) SALDO PROPINAS:', this.moneyStr(report.unpaidTips, report.currency)));
    }
    if (report.voidedTotal > 0) {
      lines.push(this.twoColumns('ANULACIONES (VOID):', this.moneyStr(report.voidedTotal, report.currency)));
    }
    lines.push(subDiv);

    // Ventas por Método de Pago
    lines.push(this.center('TOTALES POR MEDIO DE PAGO'));
    lines.push(subDiv);
    for (const m of report.totalsByMethod) {
      if (m.net !== 0 || m.in !== 0) {
        lines.push(this.twoColumns(m.method, this.moneyStr(m.net, report.currency)));
      }
    }
    lines.push(subDiv);

    // Movimientos de Gaveta
    lines.push(this.center('FLUJO DE CAJA (EFECTIVO)'));
    lines.push(subDiv);
    lines.push(this.twoColumns('FONDO APERTURA:', this.moneyStr(report.initialBalance, report.currency)));
    lines.push(this.twoColumns('(+) INGRESOS MANUALES:', this.moneyStr(report.deposits, report.currency)));
    lines.push(this.twoColumns('(-) GASTOS MENORES:', this.moneyStr(report.withdrawals, report.currency)));
    lines.push(this.twoColumns('(-) REMESAS (SAFE DROP):', this.moneyStr(report.safeDrops, report.currency)));
    lines.push(div);
    lines.push(this.twoColumns('EFECTIVO ESPERADO EN CAJA:', this.moneyStr(report.currentCashInDrawer, report.currency)));
    lines.push(div);

    // Conciliación y Arqueo (si existe)
    if (report.reconciliation) {
      lines.push(this.center('ARQUEO Y CONCILIACION'));
      lines.push(subDiv);
      lines.push(this.twoColumns('EFECTIVO DECLARADO:', this.moneyStr(report.reconciliation.declaredCash, report.currency)));
      lines.push(this.twoColumns('DIFERENCIA (DESCUADRE):', this.moneyStr(report.reconciliation.difference, report.currency)));
      lines.push(this.twoColumns('ESTADO ARQUEO:', report.reconciliation.status));

      if (report.reconciliation.retainedFloat !== undefined) {
        lines.push(subDiv);
        lines.push(this.twoColumns('FONDO BASE RETENIDO:', this.moneyStr(report.reconciliation.retainedFloat, report.currency)));
        lines.push(this.twoColumns('DEPOSITO BANCARIO / REMESA:', this.moneyStr(report.reconciliation.bankDeposit || 0, report.currency)));
      }

      if (report.reconciliation.posVoucherBatches && report.reconciliation.posVoucherBatches.length > 0) {
        lines.push(subDiv);
        lines.push(this.center('LOTES TERMINALES POS'));
        for (const batch of report.reconciliation.posVoucherBatches) {
          lines.push(this.twoColumns(`${batch.terminalId} (LOTE ${batch.batchNumber}):`, this.moneyStr(batch.totalAmount, report.currency)));
          lines.push(this.twoColumns('  CUPONES / VOUCHERS:', batch.voucherCount.toString()));
        }
      }

      if (report.reconciliation.supervisorId) {
        lines.push(subDiv);
        lines.push(this.twoColumns('SUPERVISOR:', report.reconciliation.supervisorId));
      }
      if (report.reconciliation.signatureToken) {
        lines.push(this.center(`FIRMA: ${report.reconciliation.signatureToken.slice(0, 16)}...`));
      }
      lines.push(div);
    }

    lines.push(this.center(report.isFiscalFinalCut ? '*** CORTE FINAL DEFINITIVO ***' : '*** COPIA INFORMATIVA NO FISCAL ***'));
    lines.push('\n\n');

    return lines.join('\n');
  }

  /**
   * Genera la cadena con secuencias ESC/POS para un reporte X/Z.
   * Para enviar directamente al puerto USB, serie o socket TCP sin corrupción UTF-8, use `formatAuditReportEscPosBytes`.
   */
  public formatAuditReportEscPos(report: ShiftReportData): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    let result = '';

    // Inicializar + seleccionar página de códigos CP858 (acentos, ñ, ¡, ¿, €)
    result += ESC_POS_COMMANDS.INIT;
    result += ESC_POS_COMMANDS.SELECT_CODEPAGE_CP858;

    // Abrir cajón si está configurado
    if (this.options.openCashDrawer) {
      result += ESC_POS_COMMANDS.OPEN_DRAWER;
    }

    // Encabezado con negrita y centrado
    result += ESC_POS_COMMANDS.ALIGN_CENTER;
    result += ESC_POS_COMMANDS.BOLD_ON;
    if (this.options.storeName) {
      result += `${this.options.storeName}\n`;
    }
    result += ESC_POS_COMMANDS.BOLD_OFF;

    if (this.options.storeAddress) {
      result += `${this.options.storeAddress}\n`;
    }
    if (this.options.storeTaxId) {
      result += `RFC/RUT: ${this.options.storeTaxId}\n`;
    }

    result += '='.repeat(this.width) + '\n';
    result += ESC_POS_COMMANDS.BOLD_ON;
    result += `${report.reportTitle}\n`;
    if (report.reportNumber !== undefined) {
      result += `FOLIO ${report.reportType}: #${String(report.reportNumber).padStart(6, '0')}\n`;
    }
    result += ESC_POS_COMMANDS.BOLD_OFF;
    result += '='.repeat(this.width) + '\n';

    // Cuerpo en texto plano con alineación izquierda
    result += ESC_POS_COMMANDS.ALIGN_LEFT;
    result += this.twoColumns('FECHA:', report.generatedAt.slice(0, 19).replace('T', ' ')) + '\n';
    result += this.twoColumns('TURNO ID:', report.shiftId) + '\n';
    result += this.twoColumns('CAJA:', report.cashRegisterName || report.cashRegisterId) + '\n';
    result += this.twoColumns('CAJERO:', report.cashierName) + '\n';
    result += '-'.repeat(this.width) + '\n';

    // Ventas
    result += ESC_POS_COMMANDS.BOLD_ON;
    result += this.twoColumns('VENTAS NETAS:', this.moneyStr(report.netSales, report.currency)) + '\n';
    result += ESC_POS_COMMANDS.BOLD_OFF;

    if (report.tipsCollected > 0) {
      result += this.twoColumns('PROPINAS TOTALES:', this.moneyStr(report.tipsCollected, report.currency)) + '\n';
    }

    result += this.twoColumns('EFECTIVO EN CAJA:', this.moneyStr(report.currentCashInDrawer, report.currency)) + '\n';

    if (report.reconciliation) {
      result += '-'.repeat(this.width) + '\n';
      result += this.twoColumns('DECLARADO:', this.moneyStr(report.reconciliation.declaredCash, report.currency)) + '\n';
      result += ESC_POS_COMMANDS.BOLD_ON;
      result += this.twoColumns('DIFERENCIA:', this.moneyStr(report.reconciliation.difference, report.currency)) + '\n';
      result += this.twoColumns('ESTADO:', report.reconciliation.status) + '\n';
      result += ESC_POS_COMMANDS.BOLD_OFF;

      if (report.reconciliation.retainedFloat !== undefined) {
        result += this.twoColumns('FONDO RETENIDO:', this.moneyStr(report.reconciliation.retainedFloat, report.currency)) + '\n';
        result += this.twoColumns('DEPOSITO / REMESA:', this.moneyStr(report.reconciliation.bankDeposit || 0, report.currency)) + '\n';
      }
    }

    result += '='.repeat(this.width) + '\n';
    result += ESC_POS_COMMANDS.ALIGN_CENTER;
    result += (report.isFiscalFinalCut ? '*** CORTE FISCAL Z ***' : '*** COPIA AUDITORIA X ***') + '\n';
    result += '\n\n\n\n';

    // Corte de papel
    if (this.options.cutPaper !== false) {
      result += ESC_POS_COMMANDS.PARTIAL_CUT;
    }

    return result;
  }

  /**
   * Genera el buffer binario (`Uint8Array`) en CP858 listo para escribir en puerto USB, serie o socket TCP.
   */
  public formatAuditReportEscPosBytes(report: ShiftReportData): Uint8Array {
    return encodeEscPosBytes(this.formatAuditReportEscPos(report));
  }

  /**
   * Formatea un ticket de comprobante de cobro de venta para cliente.
   */
  public formatPaymentReceiptPlainText(
    result: PaymentResult,
    transactionRef: string,
    cashierName: string,
    issuedAt: Date = new Date()
  ): string {
    const lines: string[] = [];
    const div = '='.repeat(this.width);
    const subDiv = '-'.repeat(this.width);

    if (this.options.storeName) lines.push(this.center(this.options.storeName));
    if (this.options.storeAddress) lines.push(this.center(this.options.storeAddress));
    if (this.options.isReprintCopy) lines.push(this.center('*** COPIA / REIMPRESION ***'));
    lines.push(div);
    lines.push(this.twoColumns('COMPROBANTE:', transactionRef));
    lines.push(this.twoColumns('ATENDIDO POR:', cashierName));
    lines.push(this.twoColumns('FECHA:', issuedAt.toISOString().slice(0, 19).replace('T', ' ')));
    lines.push(subDiv);

    lines.push(this.twoColumns('TOTAL VENTA:', result.ticketTotal.toString()));

    lines.push(subDiv);
    lines.push(this.center('PAGOS REGISTRADOS'));
    for (const mov of result.movements) {
      lines.push(this.twoColumns(`  ${mov.paymentMethod}:`, mov.amount.toString()));
    }

    if (result.tipMovement) {
      lines.push(this.twoColumns('  PROPINA:', result.tipMovement.amount.toString()));
    }

    if (result.tenderedCash) {
      lines.push(subDiv);
      lines.push(this.twoColumns('EFECTIVO RECIBIDO:', result.tenderedCash.toString()));
      lines.push(this.twoColumns('VUELTO / CAMBIO:', result.changeGiven.toString()));
    }

    lines.push(div);
    lines.push(this.center(this.options.footerMessage ?? '¡GRACIAS POR SU COMPRA!'));
    lines.push('\n\n');

    return lines.join('\n');
  }

  /**
   * Genera el comprobante de venta en secuencias ESC/POS (string).
   */
  public formatPaymentReceiptEscPos(
    result: PaymentResult,
    transactionRef: string,
    cashierName: string,
    issuedAt: Date = new Date()
  ): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    let raw = ESC_POS_COMMANDS.INIT + ESC_POS_COMMANDS.SELECT_CODEPAGE_CP858;
    if (this.options.openCashDrawer) {
      raw += ESC_POS_COMMANDS.OPEN_DRAWER;
    }
    raw += ESC_POS_COMMANDS.ALIGN_LEFT;
    raw += this.formatPaymentReceiptPlainText(result, transactionRef, cashierName, issuedAt);
    raw += '\n\n';
    if (this.options.cutPaper !== false) {
      raw += ESC_POS_COMMANDS.PARTIAL_CUT;
    }
    return raw;
  }

  /**
   * Genera el comprobante de venta en bytes binarios CP858 (`Uint8Array`) listo para impresora térmica.
   */
  public formatPaymentReceiptEscPosBytes(
    result: PaymentResult,
    transactionRef: string,
    cashierName: string,
    issuedAt: Date = new Date()
  ): Uint8Array {
    return encodeEscPosBytes(this.formatPaymentReceiptEscPos(result, transactionRef, cashierName, issuedAt));
  }

  /**
   * Formatea un ticket de comprobante de remesa bancaria o depósito a bóveda (Safe Drop) en texto plano.
   */
  public formatSafeDropReceiptPlainText(
    movement: CashMovement,
    cashierName: string,
    copyLabel?: string
  ): string {
    const lines: string[] = [];
    const div = '='.repeat(this.width);
    const subDiv = '-'.repeat(this.width);

    if (this.options.storeName) lines.push(this.center(this.options.storeName));
    if (this.options.storeAddress) lines.push(this.center(this.options.storeAddress));
    if (this.options.isReprintCopy) lines.push(this.center('*** COPIA / REIMPRESION ***'));
    if (this.options.storeTaxId) lines.push(this.center(`ID FISCAL: ${this.options.storeTaxId}`));
    lines.push(div);
    lines.push(this.center('COMPROBANTE DE REMESA / SAFE DROP'));
    if (copyLabel) {
      lines.push(this.center(`[ ${copyLabel} ]`));
    }
    lines.push(div);
    lines.push(this.twoColumns('MOVIMIENTO ID:', movement.id));
    if (movement.sequenceNumber !== undefined) {
      lines.push(this.twoColumns('Nº SECUENCIA:', `#${movement.sequenceNumber}`));
    }
    lines.push(this.twoColumns('TURNO ID:', movement.shiftId));
    lines.push(this.twoColumns('CAJERO(A):', cashierName));
    lines.push(this.twoColumns('FECHA:', movement.timestamp.toISOString().slice(0, 19).replace('T', ' ')));
    lines.push(subDiv);
    lines.push(this.twoColumns('MONTO REMESA:', movement.amount.toString()));
    lines.push(this.twoColumns('CONCEPTO:', movement.concept));

    if (movement.safeDropDetails) {
      lines.push(subDiv);
      if (movement.safeDropDetails.envelopeNumber) {
        lines.push(this.twoColumns('Nº DE SOBRE:', movement.safeDropDetails.envelopeNumber));
      }
      if (movement.safeDropDetails.bagSealNumber) {
        lines.push(this.twoColumns('Nº PRECINTO/BOLSA:', movement.safeDropDetails.bagSealNumber));
      }
      if (movement.safeDropDetails.destinationVault) {
        lines.push(this.twoColumns('DESTINO / BÓVEDA:', movement.safeDropDetails.destinationVault));
      }
      if (movement.safeDropDetails.witness) {
        lines.push(this.twoColumns('TESTIGO/SUPERVISOR:', movement.safeDropDetails.witness.name));
      }
    }

    lines.push(subDiv);
    lines.push('');
    lines.push(this.center('________________________'));
    lines.push(this.center('FIRMA ENTREGA (CAJERO)'));
    lines.push('');
    lines.push(this.center('________________________'));
    lines.push(this.center('FIRMA RECIBE (TESTIGO / BÓVEDA)'));
    lines.push(div);
    lines.push('\n');

    return lines.join('\n');
  }

  /**
   * Genera el comprobante de remesa en comandos ESC/POS (string).
   * Si `dualReceipt` es true, genera 2 copias consecutivas (Cajero y Bóveda) separadas por corte de papel.
   */
  public formatSafeDropReceiptEscPos(
    movement: CashMovement,
    cashierName: string,
    options?: { dualReceipt?: boolean }
  ): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    let raw = ESC_POS_COMMANDS.INIT + ESC_POS_COMMANDS.SELECT_CODEPAGE_CP858;
    if (this.options.openCashDrawer) {
      raw += ESC_POS_COMMANDS.OPEN_DRAWER;
    }

    const isDual = options?.dualReceipt ?? false;
    if (isDual) {
      // Copia 1: Cajero
      raw += ESC_POS_COMMANDS.ALIGN_LEFT;
      raw += this.formatSafeDropReceiptPlainText(movement, cashierName, 'COPIA CAJERO / GAVETA');
      raw += '\n\n\n';
      if (this.options.cutPaper !== false) {
        raw += ESC_POS_COMMANDS.PARTIAL_CUT;
      }
      // Copia 2: Bóveda / Traslado
      raw += ESC_POS_COMMANDS.ALIGN_LEFT;
      raw += this.formatSafeDropReceiptPlainText(movement, cashierName, 'COPIA BÓVEDA / TRASLADO');
      raw += '\n\n\n';
      if (this.options.cutPaper !== false) {
        raw += ESC_POS_COMMANDS.PARTIAL_CUT;
      }
    } else {
      raw += ESC_POS_COMMANDS.ALIGN_LEFT;
      raw += this.formatSafeDropReceiptPlainText(movement, cashierName);
      raw += '\n\n\n';
      if (this.options.cutPaper !== false) {
        raw += ESC_POS_COMMANDS.PARTIAL_CUT;
      }
    }

    return raw;
  }

  /**
   * Genera el comprobante de remesa en bytes binarios CP858 (`Uint8Array`) para impresora térmica.
   */
  public formatSafeDropReceiptEscPosBytes(
    movement: CashMovement,
    cashierName: string,
    options?: { dualReceipt?: boolean }
  ): Uint8Array {
    return encodeEscPosBytes(this.formatSafeDropReceiptEscPos(movement, cashierName, options));
  }

  /**
   * Formatea un vale de gasto menor / caja chica (`MANUAL_WITHDRAWAL`) en texto plano.
   */
  public formatExpenseVoucherPlainText(movement: CashMovement, registerName?: string): string {
    const sep = '-'.repeat(this.width);
    const lines: string[] = [];

    if (this.options.storeName) {
      lines.push(this.center(this.options.storeName.toUpperCase()));
    }
    lines.push(this.center('VALE DE GASTO MENOR (CAJA CHICA)'));
    lines.push(sep);
    lines.push(this.twoColumns('Fecha:', movement.timestamp.toLocaleString()));
    if (registerName) lines.push(this.twoColumns('Caja:', registerName));
    lines.push(this.twoColumns('Movimiento:', movement.id));
    lines.push(this.twoColumns('Cajero:', movement.performedBy.name));
    lines.push(this.twoColumns('Concepto:', movement.concept));

    if (movement.expenseDetails) {
      lines.push(this.twoColumns('Categoria:', movement.expenseDetails.category));
      if (movement.expenseDetails.supplierName) {
        lines.push(this.twoColumns('Proveedor:', movement.expenseDetails.supplierName));
      }
      if (movement.expenseDetails.supplierTaxId) {
        lines.push(this.twoColumns('RFC/RUT:', movement.expenseDetails.supplierTaxId));
      }
      if (movement.expenseDetails.invoiceNumber) {
        lines.push(this.twoColumns('Comprobante:', movement.expenseDetails.invoiceNumber));
      }
    }

    lines.push(sep);
    lines.push(this.twoColumns('IMPORTE ENTREGADO:', this.moneyStr(movement.amount.toDecimal(), movement.amount.currency)));
    lines.push(sep);
    lines.push('');
    lines.push('Recibi conforme: ______________________');
    lines.push('Autorizo:        ______________________');
    return lines.join('\n');
  }

  public formatExpenseVoucherEscPos(movement: CashMovement, registerName?: string): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    let raw = ESC_POS_COMMANDS.INIT + ESC_POS_COMMANDS.SELECT_CODEPAGE_CP858;
    if (this.options.openCashDrawer) raw += ESC_POS_COMMANDS.OPEN_DRAWER;
    raw += this.formatExpenseVoucherPlainText(movement, registerName) + '\n\n\n';
    if (this.options.cutPaper !== false) raw += ESC_POS_COMMANDS.PARTIAL_CUT;
    return raw;
  }

  public formatExpenseVoucherEscPosBytes(movement: CashMovement, registerName?: string): Uint8Array {
    return encodeEscPosBytes(this.formatExpenseVoucherEscPos(movement, registerName));
  }

  /**
   * Formatea comprobante térmico de Reembolso (`REFUND`) o Anulación (`VOID`).
   */
  public formatRefundOrVoidReceiptPlainText(movement: CashMovement, registerName?: string): string {
    const sep = '-'.repeat(this.width);
    const lines: string[] = [];
    const isVoid = movement.type === MovementType.VOID;

    if (this.options.storeName) {
      lines.push(this.center(this.options.storeName.toUpperCase()));
    }
    lines.push(this.center(isVoid ? 'COMPROBANTE DE ANULACION' : 'COMPROBANTE DE REEMBOLSO'));
    lines.push(sep);
    lines.push(this.twoColumns('Fecha:', movement.timestamp.toLocaleString()));
    if (registerName) lines.push(this.twoColumns('Caja:', registerName));
    lines.push(this.twoColumns('Folio:', movement.id));
    if (movement.referenceId) {
      lines.push(this.twoColumns('Ref. Venta:', movement.referenceId));
    }
    lines.push(this.twoColumns('Metodo:', movement.paymentMethod));
    lines.push(this.twoColumns('Cajero:', movement.performedBy.name));
    lines.push(this.twoColumns('Motivo:', movement.voidDetails?.reason || movement.concept));

    if (movement.voidDetails) {
      lines.push(this.twoColumns('Mov. Anulado:', movement.voidDetails.voidedMovementId));
      lines.push(this.twoColumns('Autorizo:', movement.voidDetails.authorizedBy.name));
    }

    lines.push(sep);
    lines.push(this.twoColumns('MONTO:', this.moneyStr(movement.amount.toDecimal(), movement.amount.currency)));
    lines.push(sep);
    lines.push('');
    lines.push('Firma Supervisor: _____________________');
    return lines.join('\n');
  }

  public formatRefundOrVoidReceiptEscPos(movement: CashMovement, registerName?: string): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    let raw = ESC_POS_COMMANDS.INIT + ESC_POS_COMMANDS.SELECT_CODEPAGE_CP858;
    if (this.options.openCashDrawer) raw += ESC_POS_COMMANDS.OPEN_DRAWER;
    raw += this.formatRefundOrVoidReceiptPlainText(movement, registerName) + '\n\n\n';
    if (this.options.cutPaper !== false) raw += ESC_POS_COMMANDS.PARTIAL_CUT;
    return raw;
  }

  public formatRefundOrVoidReceiptEscPosBytes(movement: CashMovement, registerName?: string): Uint8Array {
    return encodeEscPosBytes(this.formatRefundOrVoidReceiptEscPos(movement, registerName));
  }

  /**
   * Formatea acta de relevo de cajero (`HandoverRecord`) en texto plano.
   */
  public formatHandoverReceiptPlainText(
    shiftId: string,
    record: HandoverRecord,
    registerName?: string
  ): string {
    const sep = '-'.repeat(this.width);
    const rec = record.intermediateReconciliation;
    const currency = rec.expectedCash.currency;
    const lines: string[] = [];

    if (this.options.storeName) {
      lines.push(this.center(this.options.storeName.toUpperCase()));
    }
    lines.push(this.center('ACTA DE RELEVO DE CAJERO'));
    lines.push(sep);
    lines.push(this.twoColumns('Fecha:', record.timestamp.toLocaleString()));
    lines.push(this.twoColumns('Turno:', shiftId));
    if (registerName) lines.push(this.twoColumns('Caja:', registerName));
    lines.push(this.twoColumns('Cajero Saliente:', record.outgoingCashier.name));
    lines.push(this.twoColumns('Cajero Entrante:', record.incomingCashier.name));
    if (rec.supervisorId) {
      lines.push(this.twoColumns('Supervisor:', rec.supervisorId));
    }
    lines.push(sep);
    lines.push(this.twoColumns('Efectivo Declarado:', this.moneyStr(rec.declaredCash.toDecimal(), currency)));
    if (!rec.isBlindCount) {
      lines.push(this.twoColumns('Efectivo Esperado:', this.moneyStr(rec.expectedCash.toDecimal(), currency)));
      lines.push(this.twoColumns('Diferencia:', this.moneyStr(rec.cashDifference.toDecimal(), currency)));
    }
    if (record.notes) {
      lines.push(this.twoColumns('Notas:', record.notes));
    }
    lines.push(sep);
    lines.push('');
    lines.push('Entrega (Saliente): ___________________');
    lines.push('Recibe (Entrante):  ___________________');
    return lines.join('\n');
  }

  public formatHandoverReceiptEscPos(
    shiftId: string,
    record: HandoverRecord,
    registerName?: string
  ): string {
    assertFeatureEnabled(this.features, 'escPosPrinting');
    let raw = ESC_POS_COMMANDS.INIT + ESC_POS_COMMANDS.SELECT_CODEPAGE_CP858;
    raw += this.formatHandoverReceiptPlainText(shiftId, record, registerName) + '\n\n\n';
    if (this.options.cutPaper !== false) raw += ESC_POS_COMMANDS.PARTIAL_CUT;
    return raw;
  }

  public formatHandoverReceiptEscPosBytes(
    shiftId: string,
    record: HandoverRecord,
    registerName?: string
  ): Uint8Array {
    return encodeEscPosBytes(this.formatHandoverReceiptEscPos(shiftId, record, registerName));
  }

  // --- Métodos de formateo y alineación ---

  private center(text: string): string {
    if (text.length >= this.width) return text.slice(0, this.width);
    const totalSpaces = this.width - text.length;
    const leftSpaces = Math.floor(totalSpaces / 2);
    const rightSpaces = totalSpaces - leftSpaces;
    return ' '.repeat(leftSpaces) + text + ' '.repeat(rightSpaces);
  }

  private twoColumns(left: string, right: string): string {
    const available = this.width - left.length - right.length;
    if (available > 0) {
      return left + ' '.repeat(available) + right;
    }
    // Si no caben en una sola línea, acortar o colocar en línea siguiente
    const maxLeft = this.width - right.length - 1;
    if (maxLeft > 4) {
      return left.slice(0, maxLeft) + ' ' + right;
    }
    const rightPadding = Math.max(0, this.width - right.length);
    return `${left}\n${' '.repeat(rightPadding)}${right}`;
  }

  private moneyStr(amount: number, currency: string): string {
    const decimals = currencyDecimals(currency);
    return `${amount.toFixed(decimals)} ${currency}`;
  }
}

export interface BarcodeLabelData {
  sku: string;
  name: string;
  barcode?: string;
  priceFormatted?: string;
  binLocation?: string;
  lotNumber?: string;
  expirationDate?: string;
  companyName?: string;
}

export interface ZplFormatterOptions {
  dotsPerMm?: number; // 8 dpmm = 203 DPI (estándar), 12 dpmm = 300 DPI
  labelWidthMm?: number; // Ancho ej. 50mm
  labelHeightMm?: number; // Alto ej. 30mm
}

/**
 * Formateador agnóstico de etiquetas con códigos de barras para impresoras térmicas
 * industriales y comerciales (Zebra ZPL y ESC/POS texto).
 */
export class BarcodeLabelFormatter {
  private readonly dpmm: number;
  private readonly widthDots: number;
  private readonly heightDots: number;

  constructor(options?: ZplFormatterOptions) {
    this.dpmm = options?.dotsPerMm ?? 8; // 203 DPI por defecto
    const widthMm = options?.labelWidthMm ?? 50;
    const heightMm = options?.labelHeightMm ?? 30;
    this.widthDots = Math.round(widthMm * this.dpmm);
    this.heightDots = Math.round(heightMm * this.dpmm);
  }

  /**
   * Genera comandos ZPL (Zebra Programming Language) listos para enviar directamente
   * a cualquier impresora de etiquetas Zebra (puerto serie, USB o socket TCP 9100).
   */
  public formatZpl(data: BarcodeLabelData): string {
    const codeToPrint = data.barcode ?? data.sku;
    const isEan13 = /^\d{13}$/.test(codeToPrint);

    const commands: string[] = [];
    commands.push('^XA'); // Inicio de etiqueta
    commands.push(`^PW${this.widthDots}`); // Ancho en puntos
    commands.push(`^LL${this.heightDots}`); // Alto en puntos
    commands.push('^LH0,0'); // Origen de coordenadas

    // Cabecera: Empresa / Tienda (opcional)
    let yPos = 20;
    if (data.companyName) {
      commands.push(`^FO30,${yPos}^A0N,20,20^FD${this.sanitizeZpl(data.companyName)}^FS`);
      yPos += 25;
    }

    // Nombre del Producto (en negrita)
    commands.push(`^FO30,${yPos}^A0N,26,26^FD${this.sanitizeZpl(data.name.substring(0, 28))}^FS`);
    yPos += 35;

    // Código de Barras (EAN-13 o Code 128)
    if (isEan13) {
      // ^BEN,altura,interpretacion,linea
      commands.push(`^FO50,${yPos}^BEN,65,Y,N^FD${codeToPrint}^FS`);
    } else {
      // ^BCN,altura,interpretacion,linea,check
      commands.push(`^FO50,${yPos}^BCN,65,Y,N,N^FD${codeToPrint}^FS`);
    }
    yPos += 95;

    // Fila inferior: Precio, Ubicación o Lote
    const footerParts: string[] = [];
    if (data.priceFormatted) footerParts.push(`PVP: ${data.priceFormatted}`);
    if (data.binLocation) footerParts.push(`UBIC: ${data.binLocation}`);
    if (data.lotNumber) footerParts.push(`LOT: ${data.lotNumber}`);

    if (footerParts.length > 0) {
      commands.push(`^FO30,${yPos}^A0N,22,22^FD${this.sanitizeZpl(footerParts.join('  |  '))}^FS`);
    }

    commands.push('^XZ'); // Fin de etiqueta
    return commands.join('\n');
  }

  /**
   * Genera una representación en texto plano para impresoras térmicas de 58mm / 80mm
   * con caracteres estándar.
   */
  public formatPlainText(data: BarcodeLabelData, columnWidth: number = 32): string {
    const lines: string[] = [];
    const sep = '-'.repeat(columnWidth);

    if (data.companyName) {
      lines.push(this.center(data.companyName, columnWidth));
    }
    lines.push(this.center(data.name.substring(0, columnWidth), columnWidth));
    lines.push(sep);

    const barcode = data.barcode ?? data.sku;
    lines.push(this.center(`* ${barcode} *`, columnWidth));
    lines.push(this.center(`[ ${barcode} ]`, columnWidth));

    if (data.priceFormatted) {
      lines.push(this.center(`PRECIO: ${data.priceFormatted}`, columnWidth));
    }
    if (data.binLocation) {
      lines.push(this.center(`UBICACION: ${data.binLocation}`, columnWidth));
    }
    if (data.lotNumber) {
      lines.push(this.center(`LOTE: ${data.lotNumber}`, columnWidth));
    }

    lines.push(sep);
    return lines.join('\n');
  }

  private sanitizeZpl(text: string): string {
    return text.replace(/[\^~]/g, '');
  }

  private center(text: string, width: number): string {
    if (text.length >= width) return text.substring(0, width);
    const leftPad = Math.floor((width - text.length) / 2);
    return ' '.repeat(leftPad) + text;
  }
}

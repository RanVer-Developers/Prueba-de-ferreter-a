import { describe, expect, it } from 'vitest';
import { BarcodeLabelFormatter } from '../src/index.js';

describe('BarcodeLabelFormatter (ZPL & ESC/POS Labels)', () => {
  it('debe generar comandos ZPL válidos con código Code 128 para productos', () => {
    const formatter = new BarcodeLabelFormatter({ labelWidthMm: 50, labelHeightMm: 30 });

    const zpl = formatter.formatZpl({
      sku: 'SKU-SHIRT-M',
      barcode: 'SKU-SHIRT-M',
      name: 'Camisa Oxford Celeste M',
      priceFormatted: '$29.99 USD',
      binLocation: 'A1-R2-S3',
      lotNumber: 'LOT-99',
      companyName: 'MODA STORE',
    });

    expect(zpl).toContain('^XA'); // Inicio
    expect(zpl).toContain('^XZ'); // Fin
    expect(zpl).toContain('^PW400'); // 50mm * 8dpmm = 400 dots
    expect(zpl).toContain('MODA STORE');
    expect(zpl).toContain('Camisa Oxford Celeste M');
    expect(zpl).toContain('^BCN'); // Code 128
    expect(zpl).toContain('^FDSKU-SHIRT-M^FS');
    expect(zpl).toContain('PVP: $29.99 USD');
    expect(zpl).toContain('UBIC: A1-R2-S3');
    expect(zpl).toContain('LOT: LOT-99');
  });

  it('debe usar comando ^BEN para códigos de barra de formato EAN-13', () => {
    const formatter = new BarcodeLabelFormatter();

    const zpl = formatter.formatZpl({
      sku: 'SKU-COLA',
      barcode: '7791234567890', // 13 dígitos numéricos
      name: 'Refresco Cola 2L',
    });

    expect(zpl).toContain('^BEN'); // EAN-13
    expect(zpl).toContain('^FD7791234567890^FS');
  });

  it('debe generar etiquetas formateadas en texto monoespaciado para impresoras térmicas ESC/POS', () => {
    const formatter = new BarcodeLabelFormatter();

    const text = formatter.formatPlainText(
      {
        sku: 'SKU-COLA',
        barcode: '7791234567890',
        name: 'Refresco Cola 2L',
        priceFormatted: '$2.50 USD',
        binLocation: 'PAS-01',
        companyName: 'SUPERMERCADO',
      },
      32
    );

    expect(text).toContain('SUPERMERCADO');
    expect(text).toContain('Refresco Cola 2L');
    expect(text).toContain('* 7791234567890 *');
    expect(text).toContain('PRECIO: $2.50 USD');
    expect(text).toContain('UBICACION: PAS-01');
  });
});

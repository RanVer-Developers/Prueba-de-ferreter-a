import { describe, expect, it } from 'vitest';
import { BinLocation, InvalidBinLocationError } from '../src/index.js';

describe('BinLocation Value Object', () => {
  it('debe crear una ubicación física formateada con pasillo, estante, balda y gaveta', () => {
    const loc = BinLocation.of('A01', 'R02', 'S03', 'B04');
    expect(loc.aisle).toBe('A01');
    expect(loc.rack).toBe('R02');
    expect(loc.shelf).toBe('S03');
    expect(loc.bin).toBe('B04');
    expect(loc.code).toBe('A01-R02-S03-B04');
    expect(loc.toString()).toBe('A01-R02-S03-B04');
  });

  it('debe incluir prefijo de zona si se especifica', () => {
    const loc = BinLocation.of('A05', 'R01', 'S02', 'B01', 'FROZEN');
    expect(loc.zone).toBe('FROZEN');
    expect(loc.code).toBe('FROZEN-A05-R01-S02-B01');
  });

  it('debe validar que los campos obligatorios no estén vacíos', () => {
    expect(() => BinLocation.of('', 'R1', 'S1', 'B1')).toThrow(InvalidBinLocationError);
    expect(() => BinLocation.of('A1', '  ', 'S1', 'B1')).toThrow(InvalidBinLocationError);
  });

  it('debe serializar y deserializar JSON de BinLocation sin pérdida', () => {
    const loc = BinLocation.of('P1', 'E2', 'N3', 'G4', 'ZONA-NORTE');
    const json = loc.toJSON();
    const restored = BinLocation.fromJSON(json);
    expect(restored.isSameLocation(loc)).toBe(true);
    expect(restored.code).toBe(loc.code);
  });
});

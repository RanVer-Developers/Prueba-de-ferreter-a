import { InvalidBinLocationError } from '../errors/inventory-errors.js';

export interface BinLocationProps {
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  zone?: string;
}

export interface BinLocationJSON {
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  zone?: string;
  code: string;
}

/**
 * Value Object inmutable para la ubicación física exacta de un producto en bodega
 * (Pasillo, Estantería, Nivel/Balda, Casillero y Zona).
 */
export class BinLocation {
  public readonly aisle: string;
  public readonly rack: string;
  public readonly shelf: string;
  public readonly bin: string;
  public readonly zone?: string;
  public readonly code: string;

  constructor(props: BinLocationProps) {
    if (!props.aisle?.trim() || !props.rack?.trim() || !props.shelf?.trim() || !props.bin?.trim()) {
      throw new InvalidBinLocationError('Pasillo (aisle), estante (rack), balda (shelf) y gaveta (bin) son obligatorios.');
    }

    this.aisle = props.aisle.trim().toUpperCase();
    this.rack = props.rack.trim().toUpperCase();
    this.shelf = props.shelf.trim().toUpperCase();
    this.bin = props.bin.trim().toUpperCase();
    this.zone = props.zone ? props.zone.trim().toUpperCase() : undefined;

    const zonePrefix = this.zone ? `${this.zone}-` : '';
    this.code = `${zonePrefix}${this.aisle}-${this.rack}-${this.shelf}-${this.bin}`;
  }

  public static of(aisle: string, rack: string, shelf: string, bin: string, zone?: string): BinLocation {
    return new BinLocation({ aisle, rack, shelf, bin, zone });
  }

  public isSameLocation(other: BinLocation): boolean {
    return this.code === other.code;
  }

  public toJSON(): BinLocationJSON {
    return {
      aisle: this.aisle,
      rack: this.rack,
      shelf: this.shelf,
      bin: this.bin,
      zone: this.zone,
      code: this.code,
    };
  }

  public static fromJSON(json: BinLocationJSON): BinLocation {
    return new BinLocation({
      aisle: json.aisle,
      rack: json.rack,
      shelf: json.shelf,
      bin: json.bin,
      zone: json.zone,
    });
  }

  public toString(): string {
    return this.code;
  }
}

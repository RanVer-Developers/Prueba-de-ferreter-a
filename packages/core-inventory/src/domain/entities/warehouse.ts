import { INVENTORY_SCHEMA_VERSION } from '../services/schema-validation.js';
import { WarehouseJSONSchema, parseWithInventorySchema } from '../../schemas/inventory.schemas.js';

export interface WarehouseProps {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  allowNegativeStock?: boolean;
  address?: string;
  isTransitWarehouse?: boolean;
}

export interface WarehouseJSON {
  schemaVersion?: number;
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  allowNegativeStock: boolean;
  address?: string;
  isTransitWarehouse: boolean;
}

/**
 * Entidad que representa un almacén, bodega, sucursal o ubicación lógica de inventario.
 */
export class Warehouse {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly isActive: boolean;
  public readonly allowNegativeStock: boolean;
  public readonly address?: string;
  public readonly isTransitWarehouse: boolean;

  constructor(props: WarehouseProps) {
    this.id = props.id.trim();
    this.code = props.code.toUpperCase().trim();
    this.name = props.name.trim();
    this.isActive = props.isActive ?? true;
    this.allowNegativeStock = props.allowNegativeStock ?? false;
    this.address = props.address;
    this.isTransitWarehouse = props.isTransitWarehouse ?? false;
  }

  public deactivate(): Warehouse {
    return new Warehouse({ ...this, isActive: false });
  }

  public activate(): Warehouse {
    return new Warehouse({ ...this, isActive: true });
  }

  public toJSON(): WarehouseJSON {
    return {
      schemaVersion: INVENTORY_SCHEMA_VERSION,
      id: this.id,
      code: this.code,
      name: this.name,
      isActive: this.isActive,
      allowNegativeStock: this.allowNegativeStock,
      address: this.address,
      isTransitWarehouse: this.isTransitWarehouse,
    };
  }

  public static fromJSON(raw: WarehouseJSON | unknown): Warehouse {
    const json = parseWithInventorySchema(WarehouseJSONSchema, raw, 'Warehouse');
    return new Warehouse(json);
  }
}

import type { ProductRecord } from './types';

export const DEMO_STAFF = [
  { id: 'usr-dueno', displayName: 'Ricardo', roleCode: 'OWNER', pin: '1001' },
  { id: 'usr-encargado', displayName: 'Marta', roleCode: 'MANAGER', pin: '2002' },
  { id: 'usr-cajera', displayName: 'Lupita', roleCode: 'CASHIER', pin: '3003' },
  { id: 'usr-vendedor', displayName: 'Beto', roleCode: 'SELLER', pin: '4004' },
  { id: 'usr-bodeguero', displayName: 'Chuy', roleCode: 'WAREHOUSE', pin: '5005' },
  { id: 'usr-chofer', displayName: 'Memo', roleCode: 'DRIVER', pin: '6006' },
] as const;

const p = (id: string, name: string, unit: string, price: number, cost: number, min: number, stock: number): ProductRecord => ({
  id, name, unit, priceCents: price * 100, costCents: cost * 100, minStock: min, stock,
});

export const DEMO_PRODUCTS: ProductRecord[] = [
  p('MART-001', 'Martillo de uña 16 oz', 'pza', 145, 98, 5, 24),
  p('DEST-PH2', 'Desarmador Phillips #2', 'pza', 48, 29, 10, 40),
  p('CLAV-2P', 'Clavo 2 pulgadas (kg)', 'kg', 38, 24, 20, 85),
  p('TORN-1/4', 'Tornillo 1/4 x 2" (caja 100)', 'caja', 92, 61, 8, 6),
  p('CINT-5M', 'Cinta métrica 5 m', 'pza', 89, 55, 6, 18),
  p('PINT-VIN19', 'Pintura vinílica blanca 19 L', 'cubeta', 1290, 960, 3, 9),
  p('BROC-4', 'Brocha 4 pulgadas', 'pza', 62, 37, 8, 22),
  p('CABL-12', 'Cable THW cal. 12 (metro)', 'm', 21, 14, 50, 300),
  p('TUBO-PVC1', 'Tubo PVC hidráulico 1" (3 m)', 'pza', 128, 90, 10, 31),
  p('CEM-50', 'Cemento gris 50 kg', 'saco', 235, 198, 20, 120),
  p('CAND-50', 'Candado 50 mm', 'pza', 115, 70, 5, 4),
  p('GUAN-TRAB', 'Guantes de trabajo', 'par', 55, 32, 10, 37),
];

export const FERRE_AGUILAR_ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  SELLER: 'SELLER',
  WAREHOUSE: 'WAREHOUSE',
  DRIVER: 'DRIVER',
} as const;

export type FerreAguilarRoleCode = (typeof FERRE_AGUILAR_ROLES)[keyof typeof FERRE_AGUILAR_ROLES];

export interface RoleDefinition {
  id: string;
  code: FerreAguilarRoleCode;
  name: string;
  description: string;
  permissions: string[];
}

export const FERRE_AGUILAR_ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    id: 'role-owner',
    code: FERRE_AGUILAR_ROLES.OWNER,
    name: 'Dueño',
    description: 'Acceso total al negocio, costos, ganancias, bitácora anti-robo y usuarios.',
    permissions: [
      'sales:create',
      'sales:cancel',
      'sales:discount',
      'cashier:open_close',
      'cashier:charge',
      'cashier:void',
      'cashier:open_drawer_no_sale',
      'inventory:read',
      'inventory:adjust',
      'purchasing:manage',
      'purchasing:receive',
      'catalog:read',
      'catalog:edit_price',
      'logistics:assign',
      'logistics:deliver',
      'services:manage',
      'reports:operational',
      'reports:financial',
      'auth:manage_users',
      'audit:read',
    ],
  },
  {
    id: 'role-manager',
    code: FERRE_AGUILAR_ROLES.MANAGER,
    name: 'Encargado',
    description: 'Supervisa operación diaria, autoriza cancelaciones, cortes, compras y repartos.',
    permissions: [
      'sales:create',
      'sales:cancel',
      'sales:discount',
      'cashier:open_close',
      'cashier:charge',
      'cashier:void',
      'cashier:open_drawer_no_sale',
      'inventory:read',
      'inventory:adjust',
      'purchasing:manage',
      'purchasing:receive',
      'catalog:read',
      'catalog:edit_price',
      'logistics:assign',
      'logistics:deliver',
      'services:manage',
      'reports:operational',
      'audit:read',
    ],
  },
  {
    id: 'role-cashier',
    code: FERRE_AGUILAR_ROLES.CASHIER,
    name: 'Cajera',
    description: 'Abre y cierra su turno, cobra en mostrador y registra movimientos autorizados.',
    permissions: [
      'sales:create',
      'cashier:open_close',
      'cashier:charge',
      'catalog:read',
      'inventory:read',
    ],
  },
  {
    id: 'role-seller',
    code: FERRE_AGUILAR_ROLES.SELLER,
    name: 'Vendedor',
    description: 'Consulta catálogo/stock y arma pedidos o cotizaciones en mostrador.',
    permissions: ['sales:create', 'catalog:read', 'inventory:read'],
  },
  {
    id: 'role-warehouse',
    code: FERRE_AGUILAR_ROLES.WAREHOUSE,
    name: 'Bodeguero',
    description: 'Registra entradas por compra, consulta existencias y solicita ajustes auditados.',
    permissions: ['inventory:read', 'inventory:adjust', 'purchasing:receive', 'catalog:read'],
  },
  {
    id: 'role-driver',
    code: FERRE_AGUILAR_ROLES.DRIVER,
    name: 'Chofer',
    description: 'Consulta sus repartos asignados, confirma entregas y reporta mantenimiento.',
    permissions: ['logistics:deliver', 'services:manage'],
  },
];

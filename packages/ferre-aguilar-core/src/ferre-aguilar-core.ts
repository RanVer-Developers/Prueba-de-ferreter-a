import {
  createAuthRbacModule,
  type IPasswordHasher,
  type ITokenGenerator,
} from '@modulos/core-auth-rbac';
import { createCashierModule, PaymentMethod } from '@modulos/core-cashier';
import { createCatalogModule } from '@modulos/core-catalog';
import { createCustomersModule } from '@modulos/core-customers';
import { createInventoryModule, Warehouse } from '@modulos/core-inventory';
import { createLogisticsModule, Driver } from '@modulos/core-logistics';
import { createOrdersModule } from '@modulos/core-orders';
import { createPurchasingModule } from '@modulos/core-purchasing';
import { createReportsModule } from '@modulos/core-reports';
import { createServicesModule } from '@modulos/core-services';
import { createSettingsModule } from '@modulos/core-settings';
import { Money, generateId } from '@modulos/core-shared';
import { z } from 'zod';
import {
  resolveFerreAguilarFeatures,
  type FerreAguilarFeatureProfiles,
} from './config/feature-flags.js';
import {
  FERRE_AGUILAR_ROLE_DEFINITIONS,
  type FerreAguilarRoleCode,
} from './config/roles.js';

const SimplePasswordHasher: IPasswordHasher = {
  hash: async (raw: string) => `plain:${raw}`,
  verify: async (raw: string, hashed: string) => hashed === `plain:${raw}`,
};

const SimpleTokenGenerator: ITokenGenerator = {
  generateToken: async () => generateId('tok'),
  hashToken: async (rawToken: string) => `hash:${rawToken}`,
};

export const CounterSaleInputSchema = z.object({
  shiftId: z.string().min(1),
  warehouseId: z.string().min(1),
  cashierId: z.string().min(1),
  cashierName: z.string().min(1).default('Cajera'),
  idempotencyKey: z.string().min(1),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().positive(),
        unitPriceCents: z.number().int().nonnegative(),
      })
    )
    .min(1),
  paymentMethod: z.nativeEnum(PaymentMethod),
  tenderedCents: z.number().int().nonnegative(),
});
export type CounterSaleInput = z.input<typeof CounterSaleInputSchema>;

export const RegisterStaffMemberInputSchema = z.object({
  id: z.string().min(1).optional(),
  username: z.string().min(2),
  displayName: z.string().min(2),
  pin: z.string().min(4).max(8),
  roleCode: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'SELLER', 'WAREHOUSE', 'DRIVER']),
  actorId: z.string().optional(),
});
export type RegisterStaffMemberInput = z.input<typeof RegisterStaffMemberInputSchema>;

export const RegisterFleetDriverInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(2),
  phone: z.string().default('477-000-0000'),
  vehicleType: z.enum(['MOTORCYCLE', 'VAN', 'TRUCK', 'CAR', 'BICYCLE']).default('VAN'),
  plateNumber: z.string().min(3),
  maxWeightKg: z.number().positive().default(1500),
  maxPackages: z.number().int().positive().default(50),
});
export type RegisterFleetDriverInput = z.input<typeof RegisterFleetDriverInputSchema>;

export const CreateAndAssignDeliveryInputSchema = z.object({
  orderId: z.string().min(1),
  driverId: z.string().min(1),
  recipientName: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  zone: z.string().min(1),
  weightKg: z.number().positive(),
  orderTotalCents: z.number().int().nonnegative(),
  shippingFeeCents: z.number().int().nonnegative().default(0),
});
export type CreateAndAssignDeliveryInput = z.input<typeof CreateAndAssignDeliveryInputSchema>;

export const CreateFleetMaintenanceInputSchema = z.object({
  unitPlate: z.string().min(2),
  driverName: z.string().min(2),
  warehouseId: z.string().min(1).default('main-warehouse'),
  issueDescription: z.string().min(4),
  parts: z
    .array(
      z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().positive(),
        unitCostCents: z.number().int().nonnegative(),
      })
    )
    .default([]),
});
export type CreateFleetMaintenanceInput = z.input<typeof CreateFleetMaintenanceInputSchema>;

export interface FerreAguilarCoreDeps {
  featureOverrides?: Partial<FerreAguilarFeatureProfiles>;
  passwordHasher?: IPasswordHasher;
  tokenGenerator?: ITokenGenerator;
}

export function createFerreAguilarCore(deps: FerreAguilarCoreDeps = {}) {
  const features = resolveFerreAguilarFeatures(deps.featureOverrides);

  const settings = createSettingsModule({ featureProfile: features.settings });
  const authRbac = createAuthRbacModule({
    featureProfile: features.authRbac,
    passwordHasher: deps.passwordHasher ?? SimplePasswordHasher,
    tokenGenerator: deps.tokenGenerator ?? SimpleTokenGenerator,
  });
  const catalog = createCatalogModule({ featureProfile: features.catalog });
  const customers = createCustomersModule({ featureProfile: features.customers });
  const inventory = createInventoryModule({ featureProfile: features.inventory });
  const purchasing = createPurchasingModule({ featureProfile: features.purchasing });
  const orders = createOrdersModule({ featureProfile: features.orders });
  const cashier = createCashierModule({ featureProfile: features.cashier });
  const logistics = createLogisticsModule({ featureProfile: features.logistics });
  const services = createServicesModule({ featureProfile: features.services });
  const reports = createReportsModule({ featureProfile: features.reports });

  async function bootstrapDefaultRoles() {
    const created = [];
    for (const def of FERRE_AGUILAR_ROLE_DEFINITIONS) {
      const existing = await authRbac.repositories.roleRepo.findByCode(def.code);
      if (existing) {
        created.push(existing);
        continue;
      }
      const role = await authRbac.createRole({
        id: def.id,
        code: def.code,
        name: def.name,
        description: def.description,
        permissions: def.permissions,
        isSystem: true,
      });
      created.push(role);
    }
    return created;
  }

  async function registerStaffMember(rawInput: RegisterStaffMemberInput) {
    const input = RegisterStaffMemberInputSchema.parse(rawInput);
    const role = await authRbac.repositories.roleRepo.findByCode(input.roleCode);
    if (!role) {
      throw new Error(`Role ${input.roleCode} not found. Run bootstrapDefaultRoles() first.`);
    }
    return authRbac.registerUser({
      id: input.id ?? generateId('usr'),
      username: input.username,
      displayName: input.displayName,
      pin: input.pin,
      initialRoles: [{ roleId: role.id }],
      actorId: input.actorId,
    });
  }

  async function ensureMainWarehouse(name = 'Almacén Principal Ferre Aguilar') {
    const existing = await inventory.repositories.warehouseRepo.findById('main-warehouse');
    if (existing) return existing;
    const warehouse = new Warehouse({
      id: 'main-warehouse',
      code: 'MAIN',
      name,
      isActive: true,
      allowNegativeStock: false,
    });
    await inventory.repositories.warehouseRepo.save(warehouse);
    return warehouse;
  }

  async function recordCounterSale(rawInput: CounterSaleInput) {
    const input = CounterSaleInputSchema.parse(rawInput);

    for (const item of input.items) {
      const availability = await inventory.getStockAvailability({
        itemId: item.sku,
        warehouseId: input.warehouseId,
      });
      if (availability.totalAvailable < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.sku}: available ${availability.totalAvailable}, requested ${item.quantity}`
        );
      }
    }

    const orderId = generateId('ord');
    const { order } = await orders.createOrder({
      id: orderId,
      idempotencyKey: input.idempotencyKey,
      currency: 'MXN',
      channel: 'POS',
      metadata: { cashierId: input.cashierId },
    });

    let totalCents = 0;
    for (const item of input.items) {
      const lineTotalCents = Math.round(item.unitPriceCents * item.quantity);
      totalCents += lineTotalCents;
      await orders.addLine({
        orderId: order.id,
        line: {
          lineId: generateId('line'),
          productId: item.sku,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
        },
      });
    }

    for (const item of input.items) {
      await inventory.recordStockOut({
        itemId: item.sku,
        warehouseId: input.warehouseId,
        quantity: item.quantity,
        referenceId: order.id,
        performedBy: { id: input.cashierId, name: input.cashierName, role: 'CASHIER' },
        idempotencyKey: `${input.idempotencyKey}:${item.sku}`,
      });
    }

    const total = Money.fromCents(totalCents, 'MXN');
    const tendered = Money.fromCents(input.tenderedCents, 'MXN');
    const paymentResult = await cashier.recordPayment({
      shiftId: input.shiftId,
      transactionReference: order.id,
      ticketTotal: total.toCents() / 100,
      concept: `Venta mostrador ${order.id}`,
      payments: [
        {
          id: generateId('pmt'),
          method: input.paymentMethod,
          amount: total.toCents() / 100,
        },
      ],
      tenderedCash: input.paymentMethod === PaymentMethod.CASH ? tendered.toCents() / 100 : undefined,
      idempotencyKey: `pay:${input.idempotencyKey}`,
      performedBy: { id: input.cashierId, name: input.cashierName, role: 'CASHIER' },
    });

    await orders.transitionStatus({
      orderId: order.id,
      targetStatus: 'COMPLETED',
      actor: { id: input.cashierId, name: input.cashierName, role: 'CASHIER' },
    });

    return {
      orderId: order.id,
      total,
      change: paymentResult.changeGiven,
      paymentResult,
    };
  }

  async function registerFleetDriver(rawInput: RegisterFleetDriverInput) {
    const input = RegisterFleetDriverInputSchema.parse(rawInput);
    const driver = Driver.create({
      id: input.id ?? generateId('drv'),
      name: input.name,
      phone: input.phone,
      vehicleType: input.vehicleType,
      vehiclePlate: input.plateNumber,
      maxPackages: input.maxPackages,
      maxWeightGrams: Math.round(input.maxWeightKg * 1000),
    });
    await logistics.repositories.driverRepo.save(driver);
    return driver;
  }

  async function createAndAssignDelivery(rawInput: CreateAndAssignDeliveryInput) {
    const input = CreateAndAssignDeliveryInputSchema.parse(rawInput);
    const shipment = await logistics.createShipment({
      orderId: input.orderId,
      idempotencyKey: `ship:${input.orderId}`,
      origin: {
        recipientName: 'Ferre Aguilar — Tienda Única',
        street: 'Mostrador Principal',
        city: input.city,
        postalCode: input.postalCode,
        country: 'MX',
        zoneCode: 'TIENDA',
      },
      destination: {
        recipientName: input.recipientName,
        street: input.street,
        city: input.city,
        postalCode: input.postalCode,
        country: 'MX',
        zoneCode: input.zone,
      },
      packages: [
        {
          id: generateId('pkg'),
          description: `Pedido ${input.orderId}`,
          weightGrams: Math.round(input.weightKg * 1000),
          quantity: 1,
          fragile: false,
        },
      ],
      shippingFee: { cents: input.shippingFeeCents, currency: 'MXN' },
      metadata: { orderTotalCents: input.orderTotalCents },
    });

    return logistics.assignDriver({
      shipmentId: shipment.id,
      driverId: input.driverId,
    });
  }

  async function createFleetMaintenanceOrder(rawInput: CreateFleetMaintenanceInput) {
    const input = CreateFleetMaintenanceInputSchema.parse(rawInput);
    const serviceOrder = await services.createServiceOrder({
      type: 'MAINTENANCE',
      customerId: `unit:${input.unitPlate}`,
      asset: {
        description: `Unidad ${input.unitPlate} (Chofer: ${input.driverName})`,
        brand: 'Ferre Aguilar',
        model: input.unitPlate,
        serialNumber: input.unitPlate,
      },
      reportedIssue: input.issueDescription,
      isUnderWarranty: false,
      warrantyDays: 30,
    });

    if (input.parts.length > 0) {
      await services.transitionStatus({
        serviceOrderId: serviceOrder.id,
        targetStatus: 'IN_PROGRESS',
      });
    }

    for (const part of input.parts) {
      await services.consumePart({
        serviceOrderId: serviceOrder.id,
        productId: part.sku,
        sku: part.sku,
        description: part.name,
        warehouseId: input.warehouseId,
        quantity: part.quantity,
        unitPriceCents: part.unitCostCents,
        unitCostCents: part.unitCostCents,
      });
    }

    const updated = await services.repositories.serviceOrderRepository.findById(serviceOrder.id);
    return updated ?? serviceOrder;
  }

  return {
    features,
    settings,
    authRbac,
    catalog,
    customers,
    inventory,
    purchasing,
    orders,
    cashier,
    logistics,
    services,
    reports,
    bootstrapDefaultRoles,
    registerStaffMember,
    ensureMainWarehouse,
    recordCounterSale,
    registerFleetDriver,
    createAndAssignDelivery,
    createFleetMaintenanceOrder,
  };
}

export type FerreAguilarCore = ReturnType<typeof createFerreAguilarCore>;
export type { FerreAguilarRoleCode };

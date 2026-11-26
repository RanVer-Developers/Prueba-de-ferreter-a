import { z } from 'zod';
import {
  createAuthRbacModule,
  type IPasswordHasher,
  type ITokenGenerator,
} from '@modulos/core-auth-rbac';
import {
  createCashierModule,
  ExpenseCategory,
  MovementType,
  PaymentMethod,
} from '@modulos/core-cashier';
import { createCatalogModule } from '@modulos/core-catalog';
import { createCustomersModule } from '@modulos/core-customers';
import {
  createInventoryModule,
  InventoryItem,
  Money as InventoryMoney,
  UnitOfMeasure,
  Warehouse,
} from '@modulos/core-inventory';
import { createLogisticsModule } from '@modulos/core-logistics';
import { createOrdersModule } from '@modulos/core-orders';
import { createPurchasingModule } from '@modulos/core-purchasing';
import { createReportsModule } from '@modulos/core-reports';
import { createSettingsModule } from '@modulos/core-settings';
import { generateId, Money } from '@modulos/core-shared';
import {
  buildFerreteriaFeatureProfiles,
  type OwnerControlsConfig,
} from '../config/feature-profiles.js';
import {
  type ILocalDocumentStore,
  InMemoryDocumentStore,
} from '../persistence/indexeddb-store.js';
import {
  BackupSnapshotSchema,
  type CreditNoteTrack,
  CreditNoteTrackSchema,
  type DeliveryMode,
  DeliveryModeSchema,
  FERRETERIA_SCHEMA_VERSION,
  type HardwareProductProfile,
  HardwareProductProfileSchema,
  type QuoteRecord,
  QuoteRecordSchema,
  type SaleUnitKind,
  SaleUnitKindSchema,
  type SanitizedErrorLog,
  type WarehouseDispatch,
  WarehouseDispatchSchema,
} from '../schemas/ferreteria.schemas.js';
import { LocalErrorLogger } from './error-logger.service.js';

const DEFAULT_WAREHOUSE_ID = 'wh-main';
const DEFAULT_REGISTER_ID = 'reg-main';
const DEFAULT_CURRENCY = 'MXN';

class SimplePinHasher implements IPasswordHasher {
  async hash(plain: string): Promise<string> {
    return `pin:${plain}`;
  }
  async verify(plain: string, hashed: string): Promise<boolean> {
    return `pin:${plain}` === hashed;
  }
}

class SimpleLocalTokenGenerator implements ITokenGenerator {
  generateToken(): string {
    return generateId('tok');
  }
  hashToken(rawToken: string): string {
    return `hash:${rawToken}`;
  }
}

export interface CreateFerreteriaAppOptions {
  store?: ILocalDocumentStore;
  ownerPin: string;
  sellerPin?: string;
  cashierPin?: string;
  warehousePin?: string;
  controls?: Partial<OwnerControlsConfig>;
}

const RegisterProductInputSchema = z.object({
  itemId: z.string().min(1),
  sku: z.string().min(1),
  officialName: z.string().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  measures: z.array(z.string().trim().min(1)).default([]),
  category: z.string().min(1).default('General'),
  aisle: z.string().min(1).default('A1'),
  shelf: z.string().min(1).default('E1'),
  baseUnit: SaleUnitKindSchema.default('PIECE'),
  packLabel: z.string().trim().min(1).optional(),
  unitsPerPack: z.number().positive().default(1),
  publicPriceCents: z.number().int().nonnegative(),
  wholesalePriceCents: z.number().int().nonnegative(),
  wholesaleMinQty: z.number().positive().default(10),
  packPriceCents: z.number().int().nonnegative().optional(),
  lastCostCents: z.number().int().nonnegative().default(0),
  minStockQty: z.number().nonnegative().default(5),
  initialStockQty: z.number().nonnegative().default(0),
});

export type RegisterProductInput = z.input<typeof RegisterProductInputSchema>;

export interface ProductSearchResult extends HardwareProductProfile {
  availableQty: number;
  isLowStock: boolean;
}

const OrderLineRequestSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  saleAsPack: z.boolean().default(false),
});

const CreateParkedSaleInputSchema = z.object({
  sellerId: z.string().min(1),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  deliveryMode: DeliveryModeSchema.default('COUNTER_IMMEDIATE'),
  discountPercent: z.number().min(0).max(100).default(0),
  ownerPinZeroStockOverride: z.string().optional(),
  ownerPinDiscountOverride: z.string().optional(),
  lines: z.array(OrderLineRequestSchema).min(1),
});

export type CreateParkedSaleInput = z.input<typeof CreateParkedSaleInputSchema>;

const CreateQuoteInputSchema = z.object({
  customerName: z.string().min(1),
  customerId: z.string().optional(),
  reserveStock: z.boolean().default(false),
  lines: z.array(OrderLineRequestSchema).min(1),
});

export type CreateQuoteInput = z.input<typeof CreateQuoteInputSchema>;

export interface QuoteView {
  quoteId: string;
  customerName: string;
  status: QuoteRecord['status'];
  grandTotalCents: number;
  whatsappSummary: string;
  lines: Array<{
    itemId: string;
    name: string;
    quantity: number;
    saleAsPack: boolean;
    unitLabel: string;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
}

export interface CostIncreaseAlert {
  itemId: string;
  officialName: string;
  previousCostCents: number;
  newCostCents: number;
  suggestedPublicPriceCents: number;
}

export interface DailySummaryReport {
  cashSalesCents: number;
  creditSalesCents: number;
  creditPaymentsCollectedCents: number;
  expensesCents: number;
  netCashInDrawerCents: number;
  pendingDispatchCount: number;
  lowStockCount: number;
}

function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function unitLabelFor(profile: HardwareProductProfile, saleAsPack: boolean): string {
  if (saleAsPack) {
    return profile.packLabel ?? 'Caja/Paquete';
  }
  const map: Record<SaleUnitKind, string> = {
    PIECE: 'pza',
    METER: 'm',
    KG: 'kg',
    BOX: 'caja',
  };
  return map[profile.baseUnit];
}

function mapPaymentMethod(method: 'CASH' | 'CARD' | 'TRANSFER'): PaymentMethod {
  if (method === 'CARD') return PaymentMethod.DEBIT_CARD;
  if (method === 'TRANSFER') return PaymentMethod.BANK_TRANSFER;
  return PaymentMethod.CASH;
}

function mapExpenseCategory(
  category: 'SUPPLIES' | 'SERVICES' | 'MAINTENANCE' | 'OTHER'
): ExpenseCategory {
  if (category === 'SUPPLIES') return ExpenseCategory.STORE_SUPPLIES;
  if (category === 'SERVICES') return ExpenseCategory.UTILITIES_SERVICES;
  if (category === 'MAINTENANCE') return ExpenseCategory.CLEANING_SUPPLIES;
  return ExpenseCategory.OTHER;
}

export async function createFerreteriaApp(options: CreateFerreteriaAppOptions) {
  const store = options.store ?? new InMemoryDocumentStore();
  const logger = new LocalErrorLogger();
  let { controls, profiles } = buildFerreteriaFeatureProfiles(options.controls);

  const authRbac = createAuthRbacModule({
    featureProfile: profiles.authRbac,
    passwordHasher: new SimplePinHasher(),
    tokenGenerator: new SimpleLocalTokenGenerator(),
  });
  const settings = createSettingsModule({ featureProfile: profiles.settings });
  const catalog = createCatalogModule({ featureProfile: profiles.catalog });
  const customers = createCustomersModule({ featureProfile: profiles.customers });
  const orders = createOrdersModule({ featureProfile: profiles.orders });
  const cashier = createCashierModule({ featureProfile: profiles.cashier });
  const inventory = createInventoryModule({ featureProfile: profiles.inventory });
  const purchasing = createPurchasingModule({ featureProfile: profiles.purchasing });
  const reports = createReportsModule({ featureProfile: profiles.reports });
  const logistics = createLogisticsModule({ featureProfile: profiles.logistics });

  await authRbac.createRole({
    id: 'role-owner',
    code: 'OWNER',
    name: 'Dueño / Encargado General',
    permissions: [
      'catalog:manage',
      'catalog:price_override',
      'inventory:zero_stock_override',
      'customers:credit_override',
      'orders:discount_override',
      'orders:cancel',
      'cashier:close_blind',
      'settings:manage',
    ],
    isSystem: true,
  });
  await authRbac.createRole({
    id: 'role-seller',
    code: 'SELLER',
    name: 'Vendedor de Mostrador',
    permissions: ['catalog:read', 'orders:create', 'quotes:create'],
    isSystem: true,
  });
  await authRbac.createRole({
    id: 'role-cashier',
    code: 'CASHIER',
    name: 'Cajero',
    permissions: ['cashier:operate', 'customers:collect_credit'],
    isSystem: true,
  });
  await authRbac.createRole({
    id: 'role-warehouse',
    code: 'WAREHOUSE',
    name: 'Encargado de Bodega / Patio',
    permissions: ['logistics:dispatch', 'inventory:cycle_count'],
    isSystem: true,
  });

  await authRbac.registerUser({
    id: 'owner-1',
    username: 'owner',
    displayName: 'Dueño',
    pin: options.ownerPin,
    initialRoles: [{ roleId: 'role-owner' }],
  });
  await authRbac.registerUser({
    id: 'seller-1',
    username: 'seller',
    displayName: 'Vendedor Mostrador',
    pin: options.sellerPin ?? '1111',
    initialRoles: [{ roleId: 'role-seller' }],
  });
  await authRbac.registerUser({
    id: 'cashier-1',
    username: 'cashier',
    displayName: 'Cajero Principal',
    pin: options.cashierPin ?? '2222',
    initialRoles: [{ roleId: 'role-cashier' }],
  });
  await authRbac.registerUser({
    id: 'warehouse-1',
    username: 'warehouse',
    displayName: 'Encargado Bodega',
    pin: options.warehousePin ?? '3333',
    initialRoles: [{ roleId: 'role-warehouse' }],
  });

  await inventory.repositories.warehouseRepo.save(
    new Warehouse({
      id: DEFAULT_WAREHOUSE_ID,
      code: 'MAIN',
      name: 'Bodega y Patio Principal',
      isActive: true,
      allowNegativeStock: false,
      isTransitWarehouse: false,
    })
  );

  await cashier.createRegister({
    id: DEFAULT_REGISTER_ID,
    name: 'Caja Principal',
    currency: DEFAULT_CURRENCY,
    maxCashThreshold: 20000,
  });

  const productProfiles = new Map<string, HardwareProductProfile>();
  const quoteRecords = new Map<string, QuoteRecord>();
  const dispatches = new Map<string, WarehouseDispatch>();
  const creditNotes = new Map<string, CreditNoteTrack>();
  const orderCustomerMap = new Map<
    string,
    { customerId?: string; customerName: string; deliveryMode: DeliveryMode }
  >();
  const orderLineMetaMap = new Map<
    string,
    Array<{ itemId: string; quantityInBaseUnits: number; saleAsPack: boolean; unitLabel: string }>
  >();
  let activeShiftId: string | null = null;
  let dailyCashSalesCents = 0;
  let dailyCreditSalesCents = 0;
  let dailyCreditCollectedCents = 0;
  let dailyExpensesCents = 0;

  async function persistAllState(): Promise<void> {
    const stockBalances: Array<{ itemId: string; qty: number }> = [];
    for (const itemId of productProfiles.keys()) {
      stockBalances.push({ itemId, qty: await getAvailableQty(itemId) });
    }
    await store.saveCollection('products', Array.from(productProfiles.values()));
    await store.saveCollection('stockBalances', stockBalances);
    await store.saveCollection('quotes', Array.from(quoteRecords.values()));
    await store.saveCollection('dispatches', Array.from(dispatches.values()));
    await store.saveCollection('creditNotes', Array.from(creditNotes.values()));
    await store.saveCollection('controls', [controls]);
  }

  async function verifyOwnerPin(pin: string | undefined, permission: string): Promise<void> {
    if (!pin) {
      throw new Error(`Autorización requerida: ingrese PIN del Dueño para (${permission}).`);
    }
    const result = await authRbac.authorizeSupervisorOverride({
      requesterId: 'seller-1',
      approverIdentifier: 'owner',
      approverSecret: pin,
      authMethod: 'PIN',
      permission,
    });
    if (!result.decision.allowed) {
      throw new Error('PIN del Dueño inválido o sin permisos.');
    }
  }

  async function getAvailableQty(itemId: string): Promise<number> {
    try {
      const stock = await inventory.getStockAvailability({
        itemId,
        warehouseId: DEFAULT_WAREHOUSE_ID,
      });
      return stock.totalAvailable;
    } catch {
      return 0;
    }
  }

  function resolveUnitPriceCents(
    profile: HardwareProductProfile,
    quantity: number,
    saleAsPack: boolean
  ): number {
    if (saleAsPack) {
      if (profile.packPriceCents !== undefined) {
        return profile.packPriceCents;
      }
      return Math.round(profile.wholesalePriceCents * profile.unitsPerPack);
    }
    if (quantity >= profile.wholesaleMinQty) {
      return profile.wholesalePriceCents;
    }
    return profile.publicPriceCents;
  }

  function formatWhatsAppQuote(
    quoteId: string,
    customerName: string,
    lines: QuoteView['lines'],
    grandTotalCents: number
  ): string {
    const header = `*Ferretería y Materiales El Tornillo Fuerte*\nCotización: ${quoteId}\nCliente: ${customerName}\n----------------------------`;
    const body = lines
      .map(
        (l) =>
          `• ${l.quantity} ${l.unitLabel} x ${l.name} — ${Money.fromCents(l.lineTotalCents, DEFAULT_CURRENCY).format()}`
      )
      .join('\n');
    const footer = `----------------------------\n*Total estimado:* ${Money.fromCents(grandTotalCents, DEFAULT_CURRENCY).format()}\n_Precios sujetos a cambio sin previo aviso._`;
    return `${header}\n${body}\n${footer}`;
  }

  async function registerProduct(input: RegisterProductInput): Promise<HardwareProductProfile> {
    const parsed = RegisterProductInputSchema.parse(input);
    const profile = HardwareProductProfileSchema.parse({
      schemaVersion: FERRETERIA_SCHEMA_VERSION,
      ...parsed,
    });

    await catalog.createItem({
      id: profile.itemId,
      sku: profile.sku,
      name: profile.officialName,
      basePriceCents: profile.publicPriceCents,
      currency: DEFAULT_CURRENCY,
      barcodes: [profile.sku, ...profile.aliases],
    });

    const ownerActor = { id: 'owner-1', name: 'Dueño', role: 'OWNER' };
    const existingItem = await inventory.repositories.itemRepo.findById(profile.itemId);
    if (!existingItem) {
      const uomCategory =
        profile.baseUnit === 'METER'
          ? 'LENGTH'
          : profile.baseUnit === 'KG'
            ? 'WEIGHT'
            : 'DISCRETE';
      const uom = new UnitOfMeasure({
        code: profile.baseUnit,
        name: unitLabelFor(profile, false),
        category: uomCategory,
        precision: 3,
      });
      await inventory.repositories.itemRepo.save(
        new InventoryItem({
          id: profile.itemId,
          sku: profile.sku,
          name: profile.officialName,
          barcodes: [profile.sku, ...profile.aliases],
          uom,
          averageCost: InventoryMoney.fromCents(profile.lastCostCents, DEFAULT_CURRENCY),
          reorderRules: {
            minStock: profile.minStockQty,
            reorderPoint: profile.minStockQty,
          },
        })
      );
    }

    if (parsed.initialStockQty > 0) {
      await inventory.recordStockIn({
        itemId: profile.itemId,
        warehouseId: DEFAULT_WAREHOUSE_ID,
        quantity: parsed.initialStockQty,
        unitCost: InventoryMoney.fromCents(profile.lastCostCents, DEFAULT_CURRENCY),
        performedBy: ownerActor,
        referenceId: `init-${profile.itemId}`,
      });
    }

    productProfiles.set(profile.itemId, profile);
    await persistAllState();
    return profile;
  }

  async function searchProducts(query: string): Promise<ProductSearchResult[]> {
    const q = normalizeQuery(query);
    const matches: ProductSearchResult[] = [];

    for (const profile of productProfiles.values()) {
      const haystack = [
        profile.officialName,
        profile.sku,
        profile.category,
        ...profile.aliases,
        ...profile.measures,
      ]
        .map(normalizeQuery)
        .join(' ');

      if (!q || haystack.includes(q)) {
        const availableQty = await getAvailableQty(profile.itemId);
        matches.push({
          ...profile,
          availableQty,
          isLowStock: availableQty <= profile.minStockQty,
        });
      }
    }

    return matches;
  }

  async function updateProductPrice(input: {
    itemId: string;
    publicPriceCents: number;
    wholesalePriceCents?: number;
    ownerPin: string;
  }): Promise<HardwareProductProfile> {
    await verifyOwnerPin(input.ownerPin, 'catalog:price_override');
    const current = productProfiles.get(input.itemId);
    if (!current) {
      throw new Error(`Producto no encontrado: ${input.itemId}`);
    }
    const updated: HardwareProductProfile = {
      ...current,
      publicPriceCents: input.publicPriceCents,
      wholesalePriceCents: input.wholesalePriceCents ?? current.wholesalePriceCents,
    };
    await catalog.updateItem({
      itemId: input.itemId,
      basePriceCents: input.publicPriceCents,
    });
    productProfiles.set(input.itemId, updated);
    await persistAllState();
    return updated;
  }

  async function createQuote(input: CreateQuoteInput): Promise<QuoteView> {
    const parsed = CreateQuoteInputSchema.parse(input);
    const quoteId = generateId('cot');
    const now = new Date().toISOString();

    await orders.createOrder({
      id: quoteId,
      documentKind: 'QUOTE',
      currency: DEFAULT_CURRENCY,
      customerId: parsed.customerId,
    });

    const viewLines: QuoteView['lines'] = [];
    const reservations: QuoteRecord['reservations'] = [];

    for (const line of parsed.lines) {
      const profile = productProfiles.get(line.itemId);
      if (!profile) throw new Error(`Producto no encontrado: ${line.itemId}`);

      const unitPriceCents = resolveUnitPriceCents(profile, line.quantity, line.saleAsPack);
      const unitLabel = unitLabelFor(profile, line.saleAsPack);
      const baseUnitsQty = line.saleAsPack ? line.quantity * profile.unitsPerPack : line.quantity;

      await orders.addLine({
        orderId: quoteId,
        line: {
          lineId: generateId('ql'),
          productId: profile.itemId,
          name: `${profile.officialName} (${unitLabel})`,
          quantity: line.quantity,
          unitPriceCents,
        },
      });

      if (parsed.reserveStock && controls.allowQuoteReservation) {
        const reservationId = generateId('res');
        await inventory.reserveStock({
          action: 'RESERVE',
          reservationId,
          itemId: profile.itemId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          quantity: baseUnitsQty,
          referenceId: quoteId,
          ttlSeconds: 60 * 60 * 24 * 7,
        });
        reservations.push({
          reservationId,
          itemId: profile.itemId,
          quantityInBaseUnits: baseUnitsQty,
        });
      }

      viewLines.push({
        itemId: profile.itemId,
        name: profile.officialName,
        quantity: line.quantity,
        saleAsPack: line.saleAsPack,
        unitLabel,
        unitPriceCents,
        lineTotalCents: Math.round(line.quantity * unitPriceCents),
      });
    }

    const { summary } = await orders.getSummary(quoteId);
    const record = QuoteRecordSchema.parse({
      schemaVersion: FERRETERIA_SCHEMA_VERSION,
      quoteId,
      customerName: parsed.customerName,
      customerId: parsed.customerId,
      status: reservations.length > 0 ? 'RESERVED' : 'PENDING',
      reservations,
      createdAt: now,
      updatedAt: now,
    });
    quoteRecords.set(quoteId, record);
    orderLineMetaMap.set(
      quoteId,
      parsed.lines.map((l) => {
        const prof = productProfiles.get(l.itemId)!;
        return {
          itemId: l.itemId,
          quantityInBaseUnits: l.saleAsPack ? l.quantity * prof.unitsPerPack : l.quantity,
          saleAsPack: l.saleAsPack,
          unitLabel: unitLabelFor(prof, l.saleAsPack),
        };
      })
    );
    await persistAllState();

    return {
      quoteId,
      customerName: parsed.customerName,
      status: record.status,
      grandTotalCents: summary.total.toCents(),
      whatsappSummary: formatWhatsAppQuote(
        quoteId,
        parsed.customerName,
        viewLines,
        summary.total.toCents()
      ),
      lines: viewLines,
    };
  }

  async function recalculateQuotePrices(quoteId: string): Promise<QuoteView> {
    const record = quoteRecords.get(quoteId);
    if (!record) throw new Error(`Cotización no encontrada: ${quoteId}`);

    const order = await orders.repositories.orderRepo.findById(quoteId);
    if (!order) throw new Error(`Orden de cotización no encontrada: ${quoteId}`);

    const meta = orderLineMetaMap.get(quoteId) ?? [];
    const viewLines: QuoteView['lines'] = [];

    for (let i = 0; i < order.lines.length; i++) {
      const line = order.lines[i];
      const profile = productProfiles.get(line.productId);
      if (!profile) continue;
      const saleAsPack = meta[i]?.saleAsPack ?? false;
      const updatedUnitPrice = resolveUnitPriceCents(profile, line.quantity, saleAsPack);

      await orders.updateLine({
        orderId: quoteId,
        lineId: line.lineId,
        unitPriceCents: updatedUnitPrice,
      });

      const unitLabel = unitLabelFor(profile, saleAsPack);
      viewLines.push({
        itemId: profile.itemId,
        name: profile.officialName,
        quantity: line.quantity,
        saleAsPack,
        unitLabel,
        unitPriceCents: updatedUnitPrice,
        lineTotalCents: Math.round(line.quantity * updatedUnitPrice),
      });
    }

    const { summary } = await orders.getSummary(quoteId);
    record.updatedAt = new Date().toISOString();
    quoteRecords.set(quoteId, record);
    await persistAllState();

    return {
      quoteId,
      customerName: record.customerName,
      status: record.status,
      grandTotalCents: summary.total.toCents(),
      whatsappSummary: formatWhatsAppQuote(
        quoteId,
        record.customerName,
        viewLines,
        summary.total.toCents()
      ),
      lines: viewLines,
    };
  }

  async function convertQuoteToParkedOrder(input: {
    quoteId: string;
    sellerId: string;
    deliveryMode: DeliveryMode;
  }): Promise<{ orderId: string; grandTotalCents: number }> {
    const record = quoteRecords.get(input.quoteId);
    if (!record) throw new Error(`Cotización no encontrada: ${input.quoteId}`);

    const newOrderId = generateId('ord');
    const converted = await orders.convertQuoteToOrder({
      quoteId: input.quoteId,
      newOrderId,
      targetKind: 'ORDER',
    });

    await orders.parkOrder(newOrderId, `Mostrador vendedor ${input.sellerId}`);

    const meta = orderLineMetaMap.get(input.quoteId) ?? [];
    orderLineMetaMap.set(newOrderId, meta);
    orderCustomerMap.set(newOrderId, {
      customerId: record.customerId,
      customerName: record.customerName,
      deliveryMode: input.deliveryMode,
    });

    record.status = 'CONVERTED';
    record.convertedOrderId = newOrderId;
    record.updatedAt = new Date().toISOString();
    quoteRecords.set(input.quoteId, record);

    const { summary } = await orders.getSummary(newOrderId);

    if (input.deliveryMode !== 'COUNTER_IMMEDIATE') {
      const dispatch = WarehouseDispatchSchema.parse({
        schemaVersion: FERRETERIA_SCHEMA_VERSION,
        orderId: newOrderId,
        customerName: record.customerName,
        deliveryMode: input.deliveryMode,
        paymentAuthorized: false,
        authorizationKind: 'UNPAID',
        status: 'BLOCKED_UNPAID',
        itemsSummary: converted.lines.map((l, idx) => {
          const prof = productProfiles.get(l.productId)!;
          return {
            itemId: l.productId,
            name: prof.officialName,
            quantity: l.quantity,
            unitLabel: meta[idx]?.unitLabel ?? 'pza',
            aisle: prof.aisle,
            shelf: prof.shelf,
          };
        }),
        createdAt: new Date().toISOString(),
      });
      dispatches.set(newOrderId, dispatch);
    }

    await persistAllState();
    return { orderId: newOrderId, grandTotalCents: summary.total.toCents() };
  }

  async function createParkedSale(input: CreateParkedSaleInput): Promise<{
    orderId: string;
    grandTotalCents: number;
  }> {
    const parsed = CreateParkedSaleInputSchema.parse(input);

    if (parsed.discountPercent > controls.sellerMaxDiscountPercent) {
      await verifyOwnerPin(parsed.ownerPinDiscountOverride, 'orders:discount_override');
    }

    const orderId = generateId('ord');
    await orders.createOrder({
      id: orderId,
      documentKind: 'ORDER',
      currency: DEFAULT_CURRENCY,
      customerId: parsed.customerId,
    });

    const lineMetas: Array<{
      itemId: string;
      quantityInBaseUnits: number;
      saleAsPack: boolean;
      unitLabel: string;
    }> = [];
    const dispatchItems: WarehouseDispatch['itemsSummary'] = [];

    for (const line of parsed.lines) {
      const profile = productProfiles.get(line.itemId);
      if (!profile) throw new Error(`Producto no encontrado: ${line.itemId}`);

      const baseUnitsQty = line.saleAsPack ? line.quantity * profile.unitsPerPack : line.quantity;
      const available = await getAvailableQty(profile.itemId);

      if (available < baseUnitsQty && controls.blockZeroStockWithoutOwnerPin) {
        await verifyOwnerPin(parsed.ownerPinZeroStockOverride, 'inventory:zero_stock_override');
      }

      const unitPriceCents = resolveUnitPriceCents(profile, line.quantity, line.saleAsPack);
      const unitLabel = unitLabelFor(profile, line.saleAsPack);

      await orders.addLine({
        orderId,
        line: {
          lineId: generateId('ol'),
          productId: profile.itemId,
          name: `${profile.officialName} (${unitLabel})`,
          quantity: line.quantity,
          unitPriceCents,
        },
      });

      lineMetas.push({
        itemId: profile.itemId,
        quantityInBaseUnits: baseUnitsQty,
        saleAsPack: line.saleAsPack,
        unitLabel,
      });
      dispatchItems.push({
        itemId: profile.itemId,
        name: profile.officialName,
        quantity: line.quantity,
        unitLabel,
        aisle: profile.aisle,
        shelf: profile.shelf,
      });
    }

    if (parsed.discountPercent > 0) {
      await orders.applyDiscount({
        orderId,
        discount: {
          id: generateId('disc'),
          type: 'PERCENTAGE',
          value: parsed.discountPercent,
          reason: 'Descuento mostrador',
        },
      });
    }

    await orders.parkOrder(orderId, `Mostrador vendedor ${parsed.sellerId}`);

    const customerName = parsed.customerName ?? 'Público General';
    orderLineMetaMap.set(orderId, lineMetas);
    orderCustomerMap.set(orderId, {
      customerId: parsed.customerId,
      customerName,
      deliveryMode: parsed.deliveryMode,
    });

    if (parsed.deliveryMode !== 'COUNTER_IMMEDIATE') {
      dispatches.set(
        orderId,
        WarehouseDispatchSchema.parse({
          schemaVersion: FERRETERIA_SCHEMA_VERSION,
          orderId,
          customerName,
          deliveryMode: parsed.deliveryMode,
          paymentAuthorized: false,
          authorizationKind: 'UNPAID',
          status: 'BLOCKED_UNPAID',
          itemsSummary: dispatchItems,
          createdAt: new Date().toISOString(),
        })
      );
    }

    const { summary } = await orders.getSummary(orderId);
    await persistAllState();
    return { orderId, grandTotalCents: summary.total.toCents() };
  }

  async function openCashierShift(input: {
    cashierId: string;
    initialAmountPesos: number;
  }): Promise<{ shiftId: string }> {
    const shiftId = generateId('shift');
    await cashier.openShift({
      shiftId,
      cashRegisterId: DEFAULT_REGISTER_ID,
      cashier: { id: input.cashierId, name: 'Cajero Principal', role: 'CASHIER' },
      initialAmount: input.initialAmountPesos,
    });
    activeShiftId = shiftId;
    return { shiftId };
  }

  async function commitOrderInventory(orderId: string, actorId: string): Promise<void> {
    const linkedQuote = Array.from(quoteRecords.values()).find(
      (q) => q.convertedOrderId === orderId
    );
    const meta = orderLineMetaMap.get(orderId) ?? [];
    const actorSummary = { id: actorId, name: actorId, role: 'CASHIER' };

    if (linkedQuote && linkedQuote.reservations.length > 0) {
      for (const res of linkedQuote.reservations) {
        await inventory.reserveStock({
          action: 'COMMIT',
          reservationId: res.reservationId,
          itemId: res.itemId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          quantity: res.quantityInBaseUnits,
          referenceId: orderId,
          performedBy: actorSummary,
        });
      }
      return;
    }

    for (const line of meta) {
      const available = await getAvailableQty(line.itemId);
      if (available >= line.quantityInBaseUnits) {
        await inventory.recordStockOut({
          itemId: line.itemId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          quantity: line.quantityInBaseUnits,
          performedBy: actorSummary,
          referenceId: orderId,
        });
      } else {
        await inventory.adjustStock({
          itemId: line.itemId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          deltaQuantity: -line.quantityInBaseUnits,
          reason: 'Venta sin stock autorizada con PIN del Dueño',
          performedBy: actorSummary,
          authorizedBy: { id: 'owner-1', name: 'Dueño', role: 'SUPERVISOR' },
        });
      }
    }
  }

  function unlockWarehouseIfPresent(
    orderId: string,
    authKind: 'PAID' | 'AUTHORIZED_CREDIT'
  ): void {
    const existing = dispatches.get(orderId);
    if (existing) {
      existing.paymentAuthorized = true;
      existing.authorizationKind = authKind;
      existing.status = 'READY_FOR_DISPATCH';
      dispatches.set(orderId, existing);
    }
  }

  async function payOrderAtCashier(input: {
    orderId: string;
    cashierId: string;
    payments: Array<{ method: 'CASH' | 'CARD' | 'TRANSFER'; amountCents: number }>;
  }): Promise<{ paidCents: number }> {
    if (!activeShiftId) {
      throw new Error('Debe abrir turno de caja antes de cobrar.');
    }
    const order = await orders.repositories.orderRepo.findById(input.orderId);
    if (!order) throw new Error(`Nota no encontrada: ${input.orderId}`);
    if (order.isParked) {
      await orders.resumeOrder(input.orderId);
    }
    const { summary } = await orders.getSummary(input.orderId);
    const totalPaidCents = input.payments.reduce((acc, p) => acc + p.amountCents, 0);
    if (totalPaidCents < summary.total.toCents()) {
      throw new Error('El monto pagado es menor al total de la nota.');
    }

    // core-cashier expects PESOS (cents / 100)
    await cashier.recordPayment({
      shiftId: activeShiftId,
      transactionReference: input.orderId,
      ticketTotal: summary.total.toCents() / 100,
      concept: `Cobro nota ${input.orderId}`,
      performedBy: { id: input.cashierId, name: 'Cajero Principal', role: 'CASHIER' },
      payments: input.payments.map((p) => ({
        id: generateId('pay'),
        method: mapPaymentMethod(p.method),
        amount: p.amountCents / 100,
      })),
    });

    await orders.transitionStatus({
      orderId: input.orderId,
      targetStatus: 'COMPLETED',
      actor: { id: input.cashierId, name: 'Cajero Principal', role: 'CASHIER' },
    });

    await commitOrderInventory(input.orderId, input.cashierId);
    unlockWarehouseIfPresent(input.orderId, 'PAID');

    dailyCashSalesCents += summary.total.toCents();
    await persistAllState();
    return { paidCents: summary.total.toCents() };
  }

  async function registerCreditCustomer(input: {
    customerId: string;
    displayName: string;
    phone?: string;
    creditLimitCents: number;
    creditTermDays: number;
  }) {
    const customer = await customers.createCustomer({
      id: input.customerId,
      displayName: input.displayName,
      phone: input.phone,
      currency: DEFAULT_CURRENCY,
    });
    await customers.configureCredit({
      customerId: input.customerId,
      creditLimitCents: input.creditLimitCents,
      creditTermDays: input.creditTermDays,
    });
    return customer;
  }

  async function chargeOrderToCredit(input: {
    orderId: string;
    customerId: string;
    cashierId: string;
    ownerPinOverride?: string;
  }): Promise<CreditNoteTrack> {
    const order = await orders.repositories.orderRepo.findById(input.orderId);
    if (!order) throw new Error(`Nota no encontrada: ${input.orderId}`);
    if (order.isParked) {
      await orders.resumeOrder(input.orderId);
    }

    const { summary } = await orders.getSummary(input.orderId);
    const customer = await customers.repositories.customerRepo.findById(input.customerId);
    if (!customer) throw new Error(`Cliente no encontrado: ${input.customerId}`);

    const aging = await customers.getCreditAgingSummary(input.customerId);
    const hasOverdue = aging.totalOverdueCents > 0;
    const wouldExceed =
      customer.creditBalanceCents + summary.total.toCents() > customer.creditLimitCents;

    if ((hasOverdue || wouldExceed) && controls.blockExceededCreditWithoutOwnerPin) {
      await verifyOwnerPin(input.ownerPinOverride, 'customers:credit_override');
      if (wouldExceed) {
        await customers.configureCredit({
          customerId: input.customerId,
          creditLimitCents: customer.creditBalanceCents + summary.total.toCents(),
          creditTermDays: customer.creditTermDays,
        });
      }
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (customer.creditTermDays || 15));

    await customers.chargeCredit({
      customerId: input.customerId,
      amountCents: summary.total.toCents(),
      currency: DEFAULT_CURRENCY,
      referenceId: input.orderId,
      dueAt: dueDate,
      notes: `Venta a crédito ${input.orderId}`,
    });

    await orders.transitionStatus({
      orderId: input.orderId,
      targetStatus: 'COMPLETED',
      actor: { id: input.cashierId, name: 'Cajero Principal', role: 'CASHIER' },
    });
    await commitOrderInventory(input.orderId, input.cashierId);
    unlockWarehouseIfPresent(input.orderId, 'AUTHORIZED_CREDIT');

    const note = CreditNoteTrackSchema.parse({
      schemaVersion: FERRETERIA_SCHEMA_VERSION,
      noteId: generateId('cred'),
      orderId: input.orderId,
      customerId: input.customerId,
      originalTotalCents: summary.total.toCents(),
      paidCents: 0,
      remainingCents: summary.total.toCents(),
      dueAt: dueDate.toISOString(),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    });
    creditNotes.set(note.noteId, note);
    dailyCreditSalesCents += summary.total.toCents();
    await persistAllState();
    return note;
  }

  async function recordCreditNotePayment(input: {
    noteId: string;
    amountCents: number;
    cashierId: string;
    method: 'CASH' | 'CARD' | 'TRANSFER';
  }): Promise<CreditNoteTrack> {
    if (!activeShiftId) {
      throw new Error('Debe abrir turno de caja para recibir abonos.');
    }
    const note = creditNotes.get(input.noteId);
    if (!note) throw new Error(`Nota de crédito no encontrada: ${input.noteId}`);
    if (input.amountCents <= 0 || input.amountCents > note.remainingCents) {
      throw new Error('El monto del abono es inválido para el saldo pendiente de la nota.');
    }

    await customers.recordCreditPayment({
      customerId: note.customerId,
      amountCents: input.amountCents,
      referenceId: note.orderId,
    });

    await cashier.recordMovement({
      movementId: generateId('mov'),
      shiftId: activeShiftId,
      type: MovementType.MANUAL_DEPOSIT,
      amount: input.amountCents / 100,
      paymentMethod: mapPaymentMethod(input.method),
      concept: `Abono a nota de crédito ${note.noteId}`,
      referenceId: note.orderId,
      performedBy: { id: input.cashierId, name: 'Cajero Principal', role: 'CASHIER' },
    });

    note.paidCents += input.amountCents;
    note.remainingCents -= input.amountCents;
    note.status = note.remainingCents === 0 ? 'PAID' : 'PARTIAL';
    creditNotes.set(note.noteId, note);
    dailyCreditCollectedCents += input.amountCents;
    await persistAllState();
    return note;
  }

  async function dispatchWarehouseOrder(input: {
    orderId: string;
    warehouseUserId: string;
  }): Promise<WarehouseDispatch> {
    const dispatch = dispatches.get(input.orderId);
    if (!dispatch) {
      throw new Error(`No existe orden de entrega en bodega para ${input.orderId}`);
    }
    if (!dispatch.paymentAuthorized || dispatch.status === 'BLOCKED_UNPAID') {
      throw new Error(
        'ENTREGA BLOQUEADA: Esta nota aún no ha sido pagada ni autorizada a crédito en caja.'
      );
    }
    if (dispatch.status === 'DISPATCHED') {
      throw new Error('Esta orden ya fue marcada como entregada.');
    }

    dispatch.status = 'DISPATCHED';
    dispatch.dispatchedBy = input.warehouseUserId;
    dispatch.dispatchedAt = new Date().toISOString();
    dispatches.set(input.orderId, dispatch);
    await persistAllState();
    return dispatch;
  }

  function listWarehouseAuthorizedQueue(): WarehouseDispatch[] {
    return Array.from(dispatches.values()).filter(
      (d) => d.paymentAuthorized && d.status === 'READY_FOR_DISPATCH'
    );
  }

  async function receiveSupplierPurchase(input: {
    supplierName: string;
    invoiceNumber: string;
    lines: Array<{ itemId: string; quantity: number; unitCostCents: number }>;
  }): Promise<{ receiptId: string; costIncreaseAlerts: CostIncreaseAlert[] }> {
    const supplier = await purchasing.createSupplier({
      name: input.supplierName,
      paymentTerms: 'CASH',
    });

    const alerts: CostIncreaseAlert[] = [];
    const purchasingLines = [];
    const ownerActor = { id: 'owner-1', name: 'Dueño', role: 'OWNER' };

    for (const line of input.lines) {
      const profile = productProfiles.get(line.itemId);
      if (!profile) throw new Error(`Producto no encontrado: ${line.itemId}`);

      if (line.unitCostCents > profile.lastCostCents && profile.lastCostCents > 0) {
        const currentMarginRatio =
          profile.publicPriceCents > 0
            ? profile.publicPriceCents / Math.max(profile.lastCostCents, 1)
            : 1.3;
        alerts.push({
          itemId: profile.itemId,
          officialName: profile.officialName,
          previousCostCents: profile.lastCostCents,
          newCostCents: line.unitCostCents,
          suggestedPublicPriceCents: Math.round(line.unitCostCents * currentMarginRatio),
        });
      }

      await inventory.recordStockIn({
        itemId: profile.itemId,
        warehouseId: DEFAULT_WAREHOUSE_ID,
        quantity: line.quantity,
        unitCost: InventoryMoney.fromCents(line.unitCostCents, DEFAULT_CURRENCY),
        performedBy: ownerActor,
        referenceId: input.invoiceNumber,
      });

      profile.lastCostCents = line.unitCostCents;
      productProfiles.set(profile.itemId, profile);

      purchasingLines.push({
        productId: profile.itemId,
        description: profile.officialName,
        acceptedQuantity: line.quantity,
        unitCostCents: line.unitCostCents,
      });
    }

    const res = await purchasing.receivePurchase({
      supplierId: supplier.id,
      warehouseId: DEFAULT_WAREHOUSE_ID,
      invoiceNumber: input.invoiceNumber,
      lines: purchasingLines,
    });

    await persistAllState();
    return { receiptId: res.receipt.id, costIncreaseAlerts: alerts };
  }

  async function getProductsToReorder(): Promise<ProductSearchResult[]> {
    const all = await searchProducts('');
    return all.filter((p) => p.isLowStock);
  }

  async function recordCashExpense(input: {
    cashierId: string;
    amountPesos: number;
    reason: string;
    category: 'SUPPLIES' | 'SERVICES' | 'MAINTENANCE' | 'OTHER';
  }) {
    if (!activeShiftId) {
      throw new Error('Debe abrir turno de caja antes de registrar gastos.');
    }
    if (controls.requireReasonOnCashExpense && !input.reason.trim()) {
      throw new Error('El motivo del gasto en efectivo es obligatorio.');
    }
    const mov = await cashier.recordMovement({
      movementId: generateId('exp'),
      shiftId: activeShiftId,
      type: MovementType.MANUAL_WITHDRAWAL,
      amount: input.amountPesos,
      paymentMethod: PaymentMethod.CASH,
      concept: input.reason.trim(),
      expenseCategory: mapExpenseCategory(input.category),
      performedBy: { id: input.cashierId, name: 'Cajero Principal', role: 'CASHIER' },
    });
    dailyExpensesCents += Math.round(input.amountPesos * 100);
    return mov;
  }

  async function closeCashierShiftBlind(input: {
    cashierId: string;
    declaredCashPesos: number;
  }): Promise<{ declaredPesos: number; expectedPesos: number; discrepancyPesos: number }> {
    if (!activeShiftId) {
      throw new Error('No hay turno abierto.');
    }
    const shift = await cashier.closeShift({
      shiftId: activeShiftId,
      isBlindCount: controls.blindCashCountOnClose,
      declaredCashAmount: input.declaredCashPesos,
      supervisor: { id: 'owner-1', name: 'Dueño', role: 'SUPERVISOR' },
    });
    activeShiftId = null;
    const expected = shift.reconciliation?.expectedCash.toDecimal() ?? 0;
    const declared = shift.reconciliation?.declaredCash.toDecimal() ?? input.declaredCashPesos;
    return {
      declaredPesos: declared,
      expectedPesos: expected,
      discrepancyPesos: Number((declared - expected).toFixed(2)),
    };
  }

  async function getDailySummary(): Promise<DailySummaryReport> {
    const lowStock = await getProductsToReorder();
    return {
      cashSalesCents: dailyCashSalesCents,
      creditSalesCents: dailyCreditSalesCents,
      creditPaymentsCollectedCents: dailyCreditCollectedCents,
      expensesCents: dailyExpensesCents,
      netCashInDrawerCents:
        dailyCashSalesCents + dailyCreditCollectedCents - dailyExpensesCents,
      pendingDispatchCount: listWarehouseAuthorizedQueue().length,
      lowStockCount: lowStock.length,
    };
  }

  async function exportBackupWithStockJson(): Promise<string> {
    const stockBalances: Array<{ itemId: string; qty: number }> = [];
    for (const itemId of productProfiles.keys()) {
      stockBalances.push({ itemId, qty: await getAvailableQty(itemId) });
    }
    const collections = await store.exportAllCollections();
    collections['stockBalances'] = stockBalances;

    const snapshot = BackupSnapshotSchema.parse({
      schemaVersion: FERRETERIA_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      businessName: 'Ferretería y Materiales El Tornillo Fuerte',
      products: Array.from(productProfiles.values()),
      quotes: Array.from(quoteRecords.values()),
      dispatches: Array.from(dispatches.values()),
      creditNotes: Array.from(creditNotes.values()),
      controls,
      moduleSnapshots: collections,
    });
    return JSON.stringify(snapshot, null, 2);
  }

  async function importBackupJson(rawJson: string): Promise<void> {
    const parsed = BackupSnapshotSchema.parse(JSON.parse(rawJson));
    productProfiles.clear();
    quoteRecords.clear();
    dispatches.clear();
    creditNotes.clear();

    const invItems = parsed.moduleSnapshots['products'] as HardwareProductProfile[] | undefined;
    const productsToRestore = parsed.products.length > 0 ? parsed.products : invItems ?? [];

    for (const prod of productsToRestore) {
      productProfiles.set(prod.itemId, prod);
      await catalog.createItem({
        id: prod.itemId,
        sku: prod.sku,
        name: prod.officialName,
        basePriceCents: prod.publicPriceCents,
        currency: DEFAULT_CURRENCY,
        barcodes: [prod.sku, ...prod.aliases],
      });
      await inventory.repositories.itemRepo.save(
        new InventoryItem({
          id: prod.itemId,
          sku: prod.sku,
          name: prod.officialName,
          barcodes: [prod.sku, ...prod.aliases],
          uom: new UnitOfMeasure({
            code: prod.baseUnit,
            name: unitLabelFor(prod, false),
            category:
              prod.baseUnit === 'METER'
                ? 'LENGTH'
                : prod.baseUnit === 'KG'
                  ? 'WEIGHT'
                  : 'DISCRETE',
            precision: 3,
          }),
          averageCost: InventoryMoney.fromCents(prod.lastCostCents, DEFAULT_CURRENCY),
          reorderRules: {
            minStock: prod.minStockQty,
            reorderPoint: prod.minStockQty,
          },
        })
      );
    }
    for (const q of parsed.quotes) {
      quoteRecords.set(q.quoteId, q);
    }
    for (const d of parsed.dispatches) {
      dispatches.set(d.orderId, d);
    }
    for (const c of parsed.creditNotes) {
      creditNotes.set(c.noteId, c);
    }

    const savedStocks = (parsed.moduleSnapshots['stockBalances'] as
      | Array<{ itemId: string; qty: number }>
      | undefined) ?? [];

    const ownerActor = { id: 'owner-1', name: 'Dueño', role: 'OWNER' };

    for (const s of savedStocks) {
      if (s.qty > 0) {
        const prof = productProfiles.get(s.itemId);
        await inventory.recordStockIn({
          itemId: s.itemId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          quantity: s.qty,
          unitCost: InventoryMoney.fromCents(prof?.lastCostCents ?? 0, DEFAULT_CURRENCY),
          performedBy: ownerActor,
          referenceId: 'restore-backup',
        });
      }
    }

    await persistAllState();
  }

  async function getProductsByAisleOrCategory(filter: {
    aisle?: string;
    category?: string;
  }): Promise<ProductSearchResult[]> {
    const all = await searchProducts('');
    return all.filter((p) => {
      if (filter.aisle && normalizeQuery(p.aisle) !== normalizeQuery(filter.aisle)) {
        return false;
      }
      if (filter.category && normalizeQuery(p.category) !== normalizeQuery(filter.category)) {
        return false;
      }
      return true;
    });
  }

  async function recordQuickCycleCount(input: {
    userId: string;
    counts: Array<{ itemId: string; physicalQty: number }>;
  }): Promise<Array<{ itemId: string; systemQty: number; physicalQty: number; deltaQty: number }>> {
    const diffs: Array<{
      itemId: string;
      systemQty: number;
      physicalQty: number;
      deltaQty: number;
    }> = [];
    const actor = { id: input.userId, name: input.userId, role: 'WAREHOUSE' };

    for (const entry of input.counts) {
      const systemQty = await getAvailableQty(entry.itemId);
      const deltaQty = entry.physicalQty - systemQty;
      if (deltaQty !== 0) {
        await inventory.adjustStock({
          itemId: entry.itemId,
          warehouseId: DEFAULT_WAREHOUSE_ID,
          deltaQuantity: deltaQty,
          reason: 'Conteo rápido físico por pasillo/categoría',
          performedBy: actor,
          authorizedBy: { id: 'owner-1', name: 'Dueño', role: 'SUPERVISOR' },
        });
      }
      diffs.push({
        itemId: entry.itemId,
        systemQty,
        physicalQty: entry.physicalQty,
        deltaQty,
      });
    }
    await persistAllState();
    return diffs;
  }

  async function hydrateFromStore(): Promise<void> {
    const savedProducts = await store.getCollection<HardwareProductProfile>('products');
    const savedQuotes = await store.getCollection<QuoteRecord>('quotes');
    const savedDispatches = await store.getCollection<WarehouseDispatch>('dispatches');
    const savedCreditNotes = await store.getCollection<CreditNoteTrack>('creditNotes');
    const savedControls = await store.getCollection<OwnerControlsConfig>('controls');

    if (savedControls.length > 0) {
      const rebuilt = buildFerreteriaFeatureProfiles(savedControls[0]);
      controls = rebuilt.controls;
      profiles = rebuilt.profiles;
    }

    const savedStocks = await store.getCollection<{ itemId: string; qty: number }>('stockBalances');
    const stockMap = new Map(savedStocks.map((s) => [s.itemId, s.qty]));
    const ownerActor = { id: 'owner-1', name: 'Dueño', role: 'OWNER' };

    for (const prod of savedProducts) {
      if (!productProfiles.has(prod.itemId)) {
        productProfiles.set(prod.itemId, prod);
        await catalog.createItem({
          id: prod.itemId,
          sku: prod.sku,
          name: prod.officialName,
          basePriceCents: prod.publicPriceCents,
          currency: DEFAULT_CURRENCY,
          barcodes: [prod.sku, ...prod.aliases],
        });
        await inventory.repositories.itemRepo.save(
          new InventoryItem({
            id: prod.itemId,
            sku: prod.sku,
            name: prod.officialName,
            barcodes: [prod.sku, ...prod.aliases],
            uom: new UnitOfMeasure({
              code: prod.baseUnit,
              name: unitLabelFor(prod, false),
              category:
                prod.baseUnit === 'METER'
                  ? 'LENGTH'
                  : prod.baseUnit === 'KG'
                    ? 'WEIGHT'
                    : 'DISCRETE',
              precision: 3,
            }),
            averageCost: InventoryMoney.fromCents(prod.lastCostCents, DEFAULT_CURRENCY),
            reorderRules: {
              minStock: prod.minStockQty,
              reorderPoint: prod.minStockQty,
            },
          })
        );
        const qtyToRestore = stockMap.get(prod.itemId) ?? 0;
        if (qtyToRestore > 0) {
          await inventory.recordStockIn({
            itemId: prod.itemId,
            warehouseId: DEFAULT_WAREHOUSE_ID,
            quantity: qtyToRestore,
            unitCost: InventoryMoney.fromCents(prod.lastCostCents, DEFAULT_CURRENCY),
            performedBy: ownerActor,
            referenceId: 'hydrate-store',
          });
        }
      }
    }
    for (const q of savedQuotes) quoteRecords.set(q.quoteId, q);
    for (const d of savedDispatches) dispatches.set(d.orderId, d);
    for (const c of savedCreditNotes) creditNotes.set(c.noteId, c);
  }

  async function updateOwnerControls(
    nextControls: Partial<OwnerControlsConfig>,
    ownerPin: string
  ): Promise<OwnerControlsConfig> {
    await verifyOwnerPin(ownerPin, 'settings:manage');
    const rebuilt = buildFerreteriaFeatureProfiles({ ...controls, ...nextControls });
    controls = rebuilt.controls;
    profiles = rebuilt.profiles;
    await persistAllState();
    return controls;
  }

  async function listParkedOrders(): Promise<
    Array<{
      orderId: string;
      customerId?: string;
      customerName: string;
      deliveryMode: DeliveryMode;
      grandTotalCents: number;
      lineCount: number;
      createdAt: string;
    }>
  > {
    const result = [];
    for (const [orderId, meta] of orderCustomerMap.entries()) {
      const order = await orders.repositories.orderRepo.findById(orderId);
      if (order && order.isParked) {
        const { summary } = await orders.getSummary(order.id);
        result.push({
          orderId: order.id,
          customerId: meta.customerId ?? order.customerId,
          customerName: meta.customerName ?? 'Público General',
          deliveryMode: meta.deliveryMode ?? 'COUNTER_IMMEDIATE',
          grandTotalCents: summary.total.toCents(),
          lineCount: order.lines.length,
          createdAt: order.createdAt.toISOString(),
        });
      }
    }
    return result;
  }

  function listQuotes(): QuoteRecord[] {
    return Array.from(quoteRecords.values());
  }

  function listCreditNotes(): CreditNoteTrack[] {
    return Array.from(creditNotes.values());
  }

  async function listCreditCustomers() {
    return customers.searchCustomers({});
  }

  function getActiveShiftStatus(): { isOpen: boolean; shiftId: string | null } {
    return { isOpen: activeShiftId !== null, shiftId: activeShiftId };
  }

  return {
    modules: {
      settings,
      authRbac,
      catalog,
      customers,
      orders,
      cashier,
      inventory,
      purchasing,
      reports,
      logistics,
    },
    hydrateFromStore,
    getOwnerControls: () => ({ ...controls }),
    updateOwnerControls,
    registerProduct,
    searchProducts,
    getProductsByAisleOrCategory,
    recordQuickCycleCount,
    updateProductPrice,
    createQuote,
    recalculateQuotePrices,
    convertQuoteToParkedOrder,
    createParkedSale,
    listParkedOrders,
    listQuotes,
    listCreditNotes,
    listCreditCustomers,
    getActiveShiftStatus,
    openCashierShift,
    payOrderAtCashier,
    registerCreditCustomer,
    chargeOrderToCredit,
    recordCreditNotePayment,
    dispatchWarehouseOrder,
    listWarehouseAuthorizedQueue,
    receiveSupplierPurchase,
    getProductsToReorder,
    recordCashExpense,
    closeCashierShiftBlind,
    getDailySummary,
    exportBackupJson: exportBackupWithStockJson,
    importBackupJson,
    logError: (input: { screen: string; action: string; error: unknown }): SanitizedErrorLog =>
      logger.record(input),
    listErrorLogs: (): SanitizedErrorLog[] => logger.list(),
    exportTechnicalErrorReport: (): string => logger.exportTextReport(),
  };
}

export type FerreteriaApp = Awaited<ReturnType<typeof createFerreteriaApp>>;

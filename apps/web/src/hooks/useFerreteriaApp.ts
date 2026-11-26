import { useCallback, useEffect, useState } from 'react';
import {
  createFerreteriaApp,
  type FerreteriaApp,
  IndexedDbDocumentStore,
  InMemoryDocumentStore,
} from '@ferreteria/core';

async function seedInitialHardwareStore(app: FerreteriaApp): Promise<void> {
  await app.registerProduct({
    itemId: 'item-codo-12',
    sku: 'PVC-CODO-12',
    officialName: 'Conector Codo 90 grados PVC Hidráulico 13mm',
    aliases: ['codo 1/2', 'codo pvc', 'codo medio'],
    measures: ['1/2"', '13mm'],
    category: 'Plomería',
    aisle: 'P3',
    shelf: 'E2',
    baseUnit: 'PIECE',
    publicPriceCents: 1200,
    wholesalePriceCents: 950,
    wholesaleMinQty: 20,
    lastCostCents: 650,
    minStockQty: 25,
    initialStockQty: 80,
  });

  await app.registerProduct({
    itemId: 'item-pija-negra',
    sku: 'TOR-PIJA-1',
    officialName: 'Pija Negra Punta Broca para Tablaroca 1 pulgada',
    aliases: ['pija negra', 'tornillo negro', 'pija tablaroca'],
    measures: ['1"', '25mm'],
    category: 'Tornillería',
    aisle: 'P2',
    shelf: 'E1',
    baseUnit: 'PIECE',
    packLabel: 'Caja 500 pzas',
    unitsPerPack: 500,
    publicPriceCents: 150,
    wholesalePriceCents: 100,
    wholesaleMinQty: 100,
    packPriceCents: 42000,
    lastCostCents: 60,
    minStockQty: 200,
    initialStockQty: 1200,
  });

  await app.registerProduct({
    itemId: 'item-cable-12',
    sku: 'ELEC-THW-12',
    officialName: 'Cable Eléctrico THW Calibre 12 Rojo',
    aliases: ['cable 12', 'cable rojo', 'cable luz'],
    measures: ['calibre 12', '100m'],
    category: 'Eléctrico',
    aisle: 'P1',
    shelf: 'E4',
    baseUnit: 'METER',
    packLabel: 'Rollo 100m',
    unitsPerPack: 100,
    publicPriceCents: 1850,
    wholesalePriceCents: 1550,
    wholesaleMinQty: 50,
    packPriceCents: 145000,
    lastCostCents: 1150,
    minStockQty: 40,
    initialStockQty: 250,
  });

  await app.registerProduct({
    itemId: 'item-cemento-50',
    sku: 'CONS-CEM-50',
    officialName: 'Cemento Gris Portland Bulto 50kg',
    aliases: ['cemento', 'bulto cemento', 'cemento gris'],
    measures: ['50kg'],
    category: 'Construcción',
    aisle: 'PATIO',
    shelf: 'B1',
    baseUnit: 'PIECE',
    publicPriceCents: 24500,
    wholesalePriceCents: 23000,
    wholesaleMinQty: 20,
    lastCostCents: 19800,
    minStockQty: 20,
    initialStockQty: 18,
  });

  await app.registerProduct({
    itemId: 'item-llave-perica',
    sku: 'HER-PER-10',
    officialName: 'Llave Ajustable Cromada 10 pulgadas',
    aliases: ['llave perica', 'perica 10', 'llave ajustable'],
    measures: ['10"', '250mm'],
    category: 'Herramientas',
    aisle: 'P1',
    shelf: 'E1',
    baseUnit: 'PIECE',
    publicPriceCents: 28000,
    wholesalePriceCents: 25000,
    wholesaleMinQty: 5,
    lastCostCents: 18500,
    minStockQty: 4,
    initialStockQty: 9,
  });

  await app.registerProduct({
    itemId: 'item-varilla-38',
    sku: 'CONS-VAR-38',
    officialName: 'Varilla Corrugada 3/8 Tramo 12m',
    aliases: ['varilla 3/8', 'varilla'],
    measures: ['3/8"', '12m'],
    category: 'Construcción',
    aisle: 'PATIO',
    shelf: 'A2',
    baseUnit: 'PIECE',
    publicPriceCents: 16500,
    wholesalePriceCents: 15500,
    wholesaleMinQty: 30,
    lastCostCents: 13200,
    minStockQty: 25,
    initialStockQty: 0,
  });

  await app.registerCreditCustomer({
    customerId: 'cust-maestro-juan',
    displayName: 'Maestro Juan Pérez (Obras)',
    phone: '55-1234-5678',
    creditLimitCents: 500000,
    creditTermDays: 15,
  });

  await app.registerCreditCustomer({
    customerId: 'cust-constructora-sur',
    displayName: 'Constructora del Sur',
    phone: '55-8765-4321',
    creditLimitCents: 100000,
    creditTermDays: 30,
  });
}

export function useFerreteriaApp() {
  const [app, setApp] = useState<FerreteriaApp | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const bumpRevision = useCallback(() => {
    setRevision((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const store =
          typeof window !== 'undefined' && 'indexedDB' in window
            ? new IndexedDbDocumentStore(window.indexedDB)
            : new InMemoryDocumentStore();

        const instance = await createFerreteriaApp({
          store,
          ownerPin: '9999',
          sellerPin: '1111',
          cashierPin: '2222',
          warehousePin: '3333',
        });

        await instance.hydrateFromStore();
        const existing = await instance.searchProducts('');
        if (existing.length === 0) {
          await seedInitialHardwareStore(instance);
        }

        if (active) {
          setApp(instance);
          setIsLoading(false);
        }
      } catch (err) {
        if (active) {
          setInitError(
            err instanceof Error
              ? err.message
              : 'No se pudo iniciar la base de datos local del dispositivo.'
          );
          setIsLoading(false);
        }
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  return { app, isLoading, initError, revision, bumpRevision };
}

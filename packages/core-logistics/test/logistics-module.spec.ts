import { describe, expect, it } from 'vitest';
import { Driver, createLogisticsModule } from '../src/index.js';

describe('createLogisticsModule facade', () => {
  it('wires shipment, driver, and route repositories with resolved feature flags', async () => {
    const mod = createLogisticsModule({ featureProfile: 'INTERMEDIATE' });
    await mod.repositories.driverRepo.save(
      Driver.create({
        id: 'drv-1',
        name: 'Pedro',
        vehicleType: 'VAN',
        maxPackages: 20,
        maxWeightGrams: 50_000,
      })
    );

    const shipment = await mod.createShipment({
      origin: { recipientName: 'Bodega', street: 'Av. 1', city: 'GDL', country: 'MX' },
      destination: { recipientName: 'Obra', street: 'Calle 2', city: 'GDL', country: 'MX' },
      packages: [{ id: 'pkg-1', weightGrams: 2000, quantity: 1, fragile: false }],
      shippingFee: { cents: 15000, currency: 'MXN' },
    });

    const assigned = await mod.assignDriver({ shipmentId: shipment.id, driverId: 'drv-1' });
    expect(assigned.driverId).toBe('drv-1');
  });
});

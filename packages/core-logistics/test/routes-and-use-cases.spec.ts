import { describe, expect, it } from 'vitest';
import {
  AssignDriverUseCase,
  CreateShipmentUseCase,
  DEFAULT_LOGISTICS_FEATURE_FLAGS,
  Driver,
  DriverCapacityExceededError,
  InMemoryDriverRepository,
  InMemoryRouteRepository,
  InMemoryShipmentRepository,
  InvalidDriverStateError,
  LogisticsDomainError,
  ManageDeliveryRouteUseCase,
} from '../src/index.js';

const origin = {
  recipientName: 'Bodega',
  street: 'Av. 1',
  city: 'GDL',
  country: 'MX',
};

const destination = {
  recipientName: 'Cliente',
  street: 'Calle 2',
  city: 'GDL',
  country: 'MX',
};

describe('Drivers, Capacity & Delivery Routes', () => {
  it('enforces driver capacity when enforceDriverCapacity flag is enabled', async () => {
    const shipmentRepo = new InMemoryShipmentRepository();
    const driverRepo = new InMemoryDriverRepository();
    const flags = { ...DEFAULT_LOGISTICS_FEATURE_FLAGS, enforceDriverCapacity: true };

    const driver = Driver.create({
      id: 'drv-moto',
      name: 'Luis',
      vehicleType: 'MOTORCYCLE',
      maxPackages: 2,
      maxWeightGrams: 5000,
    });
    await driverRepo.save(driver);

    const createShipment = new CreateShipmentUseCase(shipmentRepo);
    const heavyShipment = await createShipment.execute({
      origin,
      destination,
      packages: [{ id: 'p1', weightGrams: 6000, quantity: 1, fragile: false }],
      shippingFee: { cents: 5000, currency: 'MXN' },
    });

    const assignUseCase = new AssignDriverUseCase(shipmentRepo, driverRepo, flags);
    await expect(
      assignUseCase.execute({ shipmentId: heavyShipment.id, driverId: driver.id })
    ).rejects.toThrow(DriverCapacityExceededError);
  });

  it('prevents assigning OFFLINE driver', async () => {
    const shipmentRepo = new InMemoryShipmentRepository();
    const driverRepo = new InMemoryDriverRepository();

    const driver = Driver.create({
      id: 'drv-off',
      name: 'Marta',
      vehicleType: 'CAR',
    });
    driver.setStatus('OFFLINE');
    await driverRepo.save(driver);

    const createShipment = new CreateShipmentUseCase(shipmentRepo);
    const shipment = await createShipment.execute({
      origin,
      destination,
      packages: [{ id: 'p1', weightGrams: 500, quantity: 1, fragile: false }],
      shippingFee: { cents: 3000, currency: 'MXN' },
    });

    const assignUseCase = new AssignDriverUseCase(shipmentRepo, driverRepo);
    await expect(
      assignUseCase.execute({ shipmentId: shipment.id, driverId: driver.id })
    ).rejects.toThrow(InvalidDriverStateError);
  });

  it('creates, starts, updates stops, and completes a delivery route while emitting events', async () => {
    const shipmentRepo = new InMemoryShipmentRepository();
    const driverRepo = new InMemoryDriverRepository();
    const routeRepo = new InMemoryRouteRepository();
    const events: string[] = [];

    const driver = Driver.create({
      id: 'drv-van',
      name: 'Pedro',
      vehicleType: 'VAN',
      maxPackages: 20,
      maxWeightGrams: 50000,
    });
    await driverRepo.save(driver);

    const createShipment = new CreateShipmentUseCase(shipmentRepo);
    const s1 = await createShipment.execute({
      origin,
      destination,
      packages: [{ id: 'p1', weightGrams: 1000, quantity: 1, fragile: false }],
      shippingFee: { cents: 3000, currency: 'MXN' },
    });
    const s2 = await createShipment.execute({
      origin,
      destination,
      packages: [{ id: 'p2', weightGrams: 2000, quantity: 1, fragile: false }],
      shippingFee: { cents: 3000, currency: 'MXN' },
    });

    const routeUseCase = new ManageDeliveryRouteUseCase(
      routeRepo,
      driverRepo,
      shipmentRepo,
      { ...DEFAULT_LOGISTICS_FEATURE_FLAGS, enforceDriverCapacity: true },
      undefined,
      (ev) => {
        events.push(ev.eventName);
      }
    );

    const route = await routeUseCase.createRoute({
      name: 'Ruta Matutina Centro',
      driverId: driver.id,
      shipmentIds: [s1.id, s2.id],
    });
    expect(route.stops).toHaveLength(2);

    const s1Assigned = await shipmentRepo.findById(s1.id);
    expect(s1Assigned?.status).toBe('ASSIGNED');
    expect(s1Assigned?.routeId).toBe(route.id);

    await routeUseCase.startRoute(route.id);
    const driverOnRoute = await driverRepo.findById(driver.id);
    expect(driverOnRoute?.status).toBe('ON_ROUTE');

    await expect(routeUseCase.completeRoute(route.id)).rejects.toThrow(LogisticsDomainError);

    await routeUseCase.updateStopStatus(route.id, s1.id, 'COMPLETED');
    await routeUseCase.updateStopStatus(route.id, s2.id, 'COMPLETED');

    const completedRoute = await routeUseCase.completeRoute(route.id);
    expect(completedRoute.status).toBe('COMPLETED');

    const driverReleased = await driverRepo.findById(driver.id);
    expect(driverReleased?.status).toBe('AVAILABLE');
    expect(driverReleased?.activeRouteId).toBeUndefined();
    expect(events).toEqual([
      'Logistics.RouteCreated',
      'Logistics.RouteStatusChanged',
      'Logistics.RouteStatusChanged',
    ]);
  });
});

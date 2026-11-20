import { describe, expect, it } from "vitest";
import {
  InMemoryParkingStorage,
  ParkingLotService,
} from "../src/index.js";

describe("ParkingLotService", () => {
  const createService = () => {
    const storage = new InMemoryParkingStorage({
      spots: [
        { code: "A1", status: "AVAILABLE" },
        { code: "A2", status: "AVAILABLE" },
      ],
      hourlyRateCents: 2000,
    });
    return new ParkingLotService(storage);
  };

  it("checks in a vehicle and marks the spot as occupied", async () => {
    const service = createService();
    const entryAt = new Date("2026-11-19T10:00:00.000Z");

    const stay = await service.checkInVehicle({
      spotCode: "A1",
      vehicleLabel: "ABC-123",
      entryAt,
    });

    expect(stay.spotCode).toBe("A1");
    expect(stay.vehicleLabel).toBe("ABC-123");
    expect(stay.status).toBe("ACTIVE");
    expect(stay.entryAt).toEqual(entryAt);

    const spots = await service.listSpots();
    expect(spots.find((s) => s.code === "A1")?.status).toBe("OCCUPIED");
  });

  it("rejects check-in when the spot is already occupied", async () => {
    const service = createService();
    await service.checkInVehicle({
      spotCode: "A1",
      vehicleLabel: "ABC-123",
      entryAt: new Date("2026-11-19T10:00:00.000Z"),
    });

    await expect(
      service.checkInVehicle({
        spotCode: "A1",
        vehicleLabel: "XYZ-999",
        entryAt: new Date("2026-11-19T10:05:00.000Z"),
      })
    ).rejects.toThrow();
  });

  it("rejects check-in when the spot does not exist", async () => {
    const service = createService();

    await expect(
      service.checkInVehicle({
        spotCode: "Z99",
        vehicleLabel: "ABC-123",
        entryAt: new Date("2026-11-19T10:00:00.000Z"),
      })
    ).rejects.toThrow();
  });

  it("checks out a vehicle, frees the spot, and returns ticket billing summary", async () => {
    const service = createService();
    const entryAt = new Date("2026-11-19T10:00:00.000Z");
    const exitAt = new Date("2026-11-19T11:15:00.000Z"); // 75 min -> 2 hours -> $40.00

    const stay = await service.checkInVehicle({
      spotCode: "A1",
      vehicleLabel: "Nissan Tsuru Blanco",
      entryAt,
    });

    const receipt = await service.checkOutVehicle({
      stayId: stay.id,
      exitAt,
    });

    expect(receipt.stay.status).toBe("COMPLETED");
    expect(receipt.stay.exitAt).toEqual(exitAt);
    expect(receipt.billableHours).toBe(2);
    expect(receipt.totalCents).toBe(4000);
    expect(receipt.spotCode).toBe("A1");
    expect(receipt.vehicleLabel).toBe("Nissan Tsuru Blanco");

    const spots = await service.listSpots();
    expect(spots.find((s) => s.code === "A1")?.status).toBe("AVAILABLE");
  });

  it("rejects checkout if stay is already completed", async () => {
    const service = createService();
    const stay = await service.checkInVehicle({
      spotCode: "A2",
      vehicleLabel: "DEF-456",
      entryAt: new Date("2026-11-19T10:00:00.000Z"),
    });

    await service.checkOutVehicle({
      stayId: stay.id,
      exitAt: new Date("2026-11-19T10:30:00.000Z"),
    });

    await expect(
      service.checkOutVehicle({
        stayId: stay.id,
        exitAt: new Date("2026-11-19T10:45:00.000Z"),
      })
    ).rejects.toThrow();
  });
});

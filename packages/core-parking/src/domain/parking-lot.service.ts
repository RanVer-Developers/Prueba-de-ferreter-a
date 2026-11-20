import type { IParkingStorageAdapter } from "../contracts/parking-storage.contract.js";
import {
  CheckInInputSchema,
  CheckOutInputSchema,
  PARKING_SCHEMA_VERSION,
  type CheckInInput,
  type CheckOutInput,
  type ParkingReceiptSummary,
  type ParkingSpot,
  type ParkingStay,
} from "../schemas/parking.schema.js";
import { calculateParkingFee } from "./calculate-fee.js";

export class ParkingLotService {
  constructor(private readonly storage: IParkingStorageAdapter) {}

  async listSpots(): Promise<ParkingSpot[]> {
    return this.storage.listSpots();
  }

  async listActiveStays(): Promise<ParkingStay[]> {
    const stays = await this.storage.listStays();
    return stays.filter((s) => s.status === "ACTIVE");
  }

  async checkInVehicle(rawInput: CheckInInput): Promise<ParkingStay> {
    const input = CheckInInputSchema.parse(rawInput);
    const spot = await this.storage.getSpot(input.spotCode);

    if (!spot) {
      throw new Error(`El cajón ${input.spotCode} no existe.`);
    }
    if (spot.status === "OCCUPIED") {
      throw new Error(`El cajón ${input.spotCode} ya está ocupado.`);
    }

    const stay: ParkingStay = {
      schemaVersion: PARKING_SCHEMA_VERSION,
      id: globalThis.crypto.randomUUID(),
      spotCode: spot.code,
      vehicleLabel: input.vehicleLabel,
      entryAt: input.entryAt,
      status: "ACTIVE",
    };

    await this.storage.saveSpot({ ...spot, status: "OCCUPIED" });
    await this.storage.saveStay(stay);

    return stay;
  }

  async checkOutVehicle(
    rawInput: CheckOutInput
  ): Promise<ParkingReceiptSummary> {
    const input = CheckOutInputSchema.parse(rawInput);
    const stay = await this.storage.getStay(input.stayId);

    if (!stay) {
      throw new Error(`No se encontró la estadía ${input.stayId}.`);
    }
    if (stay.status !== "ACTIVE") {
      throw new Error(`La estadía ${input.stayId} ya fue cerrada.`);
    }

    const hourlyRateCents = await this.storage.getHourlyRateCents();
    const fee = calculateParkingFee({
      entryAt: stay.entryAt,
      exitAt: input.exitAt,
      hourlyRateCents,
    });

    const completedStay: ParkingStay = {
      ...stay,
      status: "COMPLETED",
      exitAt: input.exitAt,
      billableHours: fee.billableHours,
      totalCents: fee.totalCents,
    };

    const spot = await this.storage.getSpot(stay.spotCode);
    if (spot) {
      await this.storage.saveSpot({ ...spot, status: "AVAILABLE" });
    }
    await this.storage.saveStay(completedStay);

    return {
      stay: completedStay,
      spotCode: completedStay.spotCode,
      vehicleLabel: completedStay.vehicleLabel,
      entryAt: completedStay.entryAt,
      exitAt: input.exitAt,
      durationMinutes: fee.durationMinutes,
      billableHours: fee.billableHours,
      totalCents: fee.totalCents,
    };
  }
}

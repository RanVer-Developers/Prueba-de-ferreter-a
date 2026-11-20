import type { IParkingStorageAdapter } from "../contracts/parking-storage.contract.js";
import {
  PARKING_SCHEMA_VERSION,
  type ParkingSpot,
  type ParkingStay,
} from "../schemas/parking.schema.js";

export interface InMemoryParkingStorageOptions {
  spots: Array<{ code: string; status?: "AVAILABLE" | "OCCUPIED" }>;
  hourlyRateCents: number;
}

export class InMemoryParkingStorage implements IParkingStorageAdapter {
  private readonly spots = new Map<string, ParkingSpot>();
  private readonly stays = new Map<string, ParkingStay>();
  private hourlyRateCents: number;

  constructor(options: InMemoryParkingStorageOptions) {
    this.hourlyRateCents = options.hourlyRateCents;
    for (const spot of options.spots) {
      this.spots.set(spot.code, {
        schemaVersion: PARKING_SCHEMA_VERSION,
        code: spot.code,
        status: spot.status ?? "AVAILABLE",
      });
    }
  }

  async getHourlyRateCents(): Promise<number> {
    return this.hourlyRateCents;
  }

  async setHourlyRateCents(rateCents: number): Promise<void> {
    this.hourlyRateCents = rateCents;
  }

  async listSpots(): Promise<ParkingSpot[]> {
    return Array.from(this.spots.values()).map((s) => ({ ...s }));
  }

  async getSpot(code: string): Promise<ParkingSpot | null> {
    const found = this.spots.get(code);
    return found ? { ...found } : null;
  }

  async saveSpot(spot: ParkingSpot): Promise<void> {
    this.spots.set(spot.code, { ...spot });
  }

  async listStays(): Promise<ParkingStay[]> {
    return Array.from(this.stays.values()).map((s) => ({
      ...s,
      entryAt: new Date(s.entryAt),
      exitAt: s.exitAt ? new Date(s.exitAt) : undefined,
    }));
  }

  async getStay(id: string): Promise<ParkingStay | null> {
    const found = this.stays.get(id);
    if (!found) return null;
    return {
      ...found,
      entryAt: new Date(found.entryAt),
      exitAt: found.exitAt ? new Date(found.exitAt) : undefined,
    };
  }

  async saveStay(stay: ParkingStay): Promise<void> {
    this.stays.set(stay.id, {
      ...stay,
      entryAt: new Date(stay.entryAt),
      exitAt: stay.exitAt ? new Date(stay.exitAt) : undefined,
    });
  }
}

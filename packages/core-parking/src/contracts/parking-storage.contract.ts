import type { ParkingSpot, ParkingStay } from "../schemas/parking.schema.js";

export interface IParkingStorageAdapter {
  getHourlyRateCents(): Promise<number>;
  setHourlyRateCents(rateCents: number): Promise<void>;
  listSpots(): Promise<ParkingSpot[]>;
  getSpot(code: string): Promise<ParkingSpot | null>;
  saveSpot(spot: ParkingSpot): Promise<void>;
  listStays(): Promise<ParkingStay[]>;
  getStay(id: string): Promise<ParkingStay | null>;
  saveStay(stay: ParkingStay): Promise<void>;
}

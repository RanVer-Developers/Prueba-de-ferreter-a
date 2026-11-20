import { z } from "zod";

export const PARKING_SCHEMA_VERSION = 1;

export const FeeCalculationInputSchema = z
  .object({
    entryAt: z.coerce.date(),
    exitAt: z.coerce.date(),
    hourlyRateCents: z.number().int().positive(),
  })
  .refine((data) => data.exitAt.getTime() >= data.entryAt.getTime(), {
    message: "exitAt must be greater than or equal to entryAt",
    path: ["exitAt"],
  });

export type FeeCalculationInput = z.input<typeof FeeCalculationInputSchema>;

export interface FeeCalculationResult {
  durationMinutes: number;
  billableHours: number;
  totalCents: number;
}

export const SpotStatusSchema = z.enum(["AVAILABLE", "OCCUPIED"]);
export type SpotStatus = z.infer<typeof SpotStatusSchema>;

export const ParkingSpotSchema = z.object({
  schemaVersion: z.number().int().default(PARKING_SCHEMA_VERSION),
  code: z.string().trim().min(1).max(20),
  status: SpotStatusSchema,
});
export type ParkingSpot = z.infer<typeof ParkingSpotSchema>;

export const StayStatusSchema = z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]);

export const ParkingStaySchema = z.object({
  schemaVersion: z.number().int().default(PARKING_SCHEMA_VERSION),
  id: z.string().min(1),
  spotCode: z.string().trim().min(1).max(20),
  vehicleLabel: z.string().trim().min(1).max(80),
  entryAt: z.coerce.date(),
  exitAt: z.coerce.date().optional(),
  status: StayStatusSchema,
  billableHours: z.number().int().positive().optional(),
  totalCents: z.number().int().nonnegative().optional(),
});
export type ParkingStay = z.infer<typeof ParkingStaySchema>;

export const CheckInInputSchema = z.object({
  spotCode: z.string().trim().min(1).max(20),
  vehicleLabel: z.string().trim().min(1).max(80),
  entryAt: z.coerce.date().default(() => new Date()),
});
export type CheckInInput = z.input<typeof CheckInInputSchema>;

export const CheckOutInputSchema = z.object({
  stayId: z.string().min(1),
  exitAt: z.coerce.date().default(() => new Date()),
});
export type CheckOutInput = z.input<typeof CheckOutInputSchema>;

export interface ParkingReceiptSummary {
  stay: ParkingStay;
  spotCode: string;
  vehicleLabel: string;
  entryAt: Date;
  exitAt: Date;
  durationMinutes: number;
  billableHours: number;
  totalCents: number;
}

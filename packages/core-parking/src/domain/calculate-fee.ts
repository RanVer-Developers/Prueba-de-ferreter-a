import {
  FeeCalculationInputSchema,
  type FeeCalculationInput,
  type FeeCalculationResult,
} from "../schemas/parking.schema.js";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/**
 * Calculates parking fee in integer cents charging per hour or fraction.
 * Minimum charge is 1 hour even when duration is 0 minutes.
 */
export function calculateParkingFee(
  rawInput: FeeCalculationInput
): FeeCalculationResult {
  const { entryAt, exitAt, hourlyRateCents } =
    FeeCalculationInputSchema.parse(rawInput);

  const elapsedMs = exitAt.getTime() - entryAt.getTime();
  const durationMinutes = Math.floor(elapsedMs / MS_PER_MINUTE);
  const billableHours = Math.max(1, Math.ceil(elapsedMs / MS_PER_HOUR));
  const totalCents = billableHours * hourlyRateCents;

  return {
    durationMinutes,
    billableHours,
    totalCents,
  };
}

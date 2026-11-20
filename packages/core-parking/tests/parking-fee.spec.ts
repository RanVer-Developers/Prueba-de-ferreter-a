import { describe, expect, it } from "vitest";
import { calculateParkingFee } from "../src/index.js";

describe("calculateParkingFee", () => {
  const hourlyRateCents = 2000; // $20.00 MXN

  it("charges 1 hour ($20.00) for a 1-minute stay", () => {
    const entryAt = new Date("2026-11-19T10:00:00.000Z");
    const exitAt = new Date("2026-11-19T10:01:00.000Z");

    const result = calculateParkingFee({ entryAt, exitAt, hourlyRateCents });

    expect(result.billableHours).toBe(1);
    expect(result.totalCents).toBe(2000);
    expect(result.durationMinutes).toBe(1);
  });

  it("charges 1 hour ($20.00) for an exact 60-minute stay", () => {
    const entryAt = new Date("2026-11-19T10:00:00.000Z");
    const exitAt = new Date("2026-11-19T11:00:00.000Z");

    const result = calculateParkingFee({ entryAt, exitAt, hourlyRateCents });

    expect(result.billableHours).toBe(1);
    expect(result.totalCents).toBe(2000);
    expect(result.durationMinutes).toBe(60);
  });

  it("charges 2 hours ($40.00) for a 61-minute stay (fraction rule)", () => {
    const entryAt = new Date("2026-11-19T10:00:00.000Z");
    const exitAt = new Date("2026-11-19T11:01:00.000Z");

    const result = calculateParkingFee({ entryAt, exitAt, hourlyRateCents });

    expect(result.billableHours).toBe(2);
    expect(result.totalCents).toBe(4000);
    expect(result.durationMinutes).toBe(61);
  });

  it("charges minimum 1 hour ($20.00) when exit equals entry", () => {
    const entryAt = new Date("2026-11-19T10:00:00.000Z");
    const exitAt = new Date("2026-11-19T10:00:00.000Z");

    const result = calculateParkingFee({ entryAt, exitAt, hourlyRateCents });

    expect(result.billableHours).toBe(1);
    expect(result.totalCents).toBe(2000);
    expect(result.durationMinutes).toBe(0);
  });

  it("throws when exitAt is earlier than entryAt", () => {
    const entryAt = new Date("2026-11-19T10:05:00.000Z");
    const exitAt = new Date("2026-11-19T10:00:00.000Z");

    expect(() =>
      calculateParkingFee({ entryAt, exitAt, hourlyRateCents })
    ).toThrow();
  });
});

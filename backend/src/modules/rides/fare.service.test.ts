import { calculateFarePaisa, distanceChargePaisa } from "./fare.service";
import { haversineKm } from "../../lib/geo";

// Same coordinates as prisma/seed.ts -- kept in sync deliberately so this
// test documents the exact numbers in docs/decisions.md's worked example.
const BANANI = { lat: 23.7937, lng: 90.4066 };
const MOHAKHALI = { lat: 23.7806, lng: 90.4023 };
const GULSHAN_1 = { lat: 23.7808, lng: 90.4142 };

describe("fare.service (docs/decisions.md worked example)", () => {
  it("Nusrat: Banani -> Mohakhali, pooled, is 3,825 paisa (BDT 38.25)", () => {
    const km = haversineKm(BANANI, MOHAKHALI);
    expect(km).toBeCloseTo(1.521, 2);
    expect(distanceChargePaisa(km)).toBe(2281n);
    expect(calculateFarePaisa(km, true)).toBe(3825n);
  });

  it("Nusrat solo (no pool discount) is 4,781 paisa (BDT 47.81)", () => {
    const km = haversineKm(BANANI, MOHAKHALI);
    expect(calculateFarePaisa(km, false)).toBe(4781n);
  });

  it("Rafiq: Banani -> Gulshan 1, pooled, is 3,955 paisa (BDT 39.55)", () => {
    const km = haversineKm(BANANI, GULSHAN_1);
    expect(km).toBeCloseTo(1.63, 2);
    expect(distanceChargePaisa(km)).toBe(2444n);
    expect(calculateFarePaisa(km, true)).toBe(3955n);
  });

  it("a zero-distance trip is still charged the base fare", () => {
    expect(calculateFarePaisa(0, false)).toBe(2500n);
  });
});

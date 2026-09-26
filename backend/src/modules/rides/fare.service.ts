// passengerFare = baseFare + distanceCharge - poolDiscount
// See docs/decisions.md#fare-model for the worked Nusrat/Rafiq example this
// is unit-tested against. All amounts are integer paisa (see
// docs/decisions.md#why-money-is-stored-as-integer-paisa-not-decimalfloat).
export const BASE_FARE_PAISA = 2500n;
export const RATE_PER_KM_PAISA = 1500n;
export const POOL_DISCOUNT_PERCENT = 20;

export function distanceChargePaisa(distanceKm: number): bigint {
  return BigInt(Math.round(distanceKm * Number(RATE_PER_KM_PAISA)));
}

/**
 * @param distanceKm haversine distance for *this passenger's own* pickup ->
 *   destination (see docs/decisions.md#matching-rule) -- each pool member
 *   gets their own fare from their own trip, never a shared/split amount.
 * @param pooled whether this ride is completing as part of a pool with 2+
 *   active members. Solo rides pay full fare.
 */
export function calculateFarePaisa(distanceKm: number, pooled: boolean): bigint {
  const subtotal = BASE_FARE_PAISA + distanceChargePaisa(distanceKm);
  if (!pooled) {
    return subtotal;
  }
  // BigInt has no fractional arithmetic; the discount is a small enough
  // paisa amount that round-tripping through Number for the percentage
  // multiply is exact for any realistic fare (well within Number.
  // MAX_SAFE_INTEGER), and matches the hand-verified worked example.
  return BigInt(Math.round(Number(subtotal) * (1 - POOL_DISCOUNT_PERCENT / 100)));
}

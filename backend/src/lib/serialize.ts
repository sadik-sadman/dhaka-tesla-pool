// BigInt doesn't survive JSON.stringify (throws TypeError). Fare/wallet
// fields are bigint (see docs/decisions.md#why-money-is-stored-as-integer-
// paisa-not-decimalfloat), so anything returned from a route that might
// carry one goes through this first.
//
// Not used for User: auth.service.ts's toPublicUser() is a deliberate
// field *allowlist* (it must never leak passwordHash), not just a BigInt
// conversion -- don't replace that with this for a full User object.
export function serializeBigInt<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}

# Assumptions, invented rules & key decisions

The PRD (Section 17) intentionally leaves parts of this spec open and asks candidates to make a reasonable assumption, document it, apply it consistently, and be ready to defend it. This file is that documentation, gathered in one place. Everything here is implemented exactly as described — if the code and this file ever disagree, the code is wrong and needs fixing, not the other way round.

## Matching rule

Two ride requests are poolable into the same vehicle when **all** of the following hold:

1. Both requests are still `REQUESTED` (not already matched elsewhere).
2. They share the same **pickup zone**.
3. Their **destination zones belong to the same corridor** — a small, hand-seeded grouping of zones that lie along a common route out of a pickup point. Seeded corridors:
   - `gulshan_banani` — Banani, Gulshan 1, Gulshan 2, Mohakhali, Bashundhara
   - `central` — Dhanmondi, Farmgate
   - `north` — Mirpur, Uttara
4. The vehicle serving the pool has enough **remaining capacity** for the new request's seat count.
5. The pool hasn't passed `DRIVER_ARRIVED` yet — once the driver has physically arrived at the pickup point, no new passenger can be folded in.

Applied to the seed cast: Nusrat (Banani → Mohakhali) and Rafiq (Banani → Gulshan 1) share the same pickup zone (Banani) and their destinations — Mohakhali and Gulshan 1 — both sit in the `gulshan_banani` corridor, so they're poolable even though their destinations aren't identical, exactly as Section 4 asks for. Shirin, arriving 30s after Rafiq and requesting the same pickup zone, is the third candidate for Bullet's remaining seat.

This is a real, if simplified, proxy for "compatible routes" without touching a map API (Section 4). The obvious next step if this grew beyond MVP: replace the static corridor table with actual polyline/route overlap from a routing engine.

## Ride lifecycle

Used exactly as suggested in Section 3, with `MATCHED` and `ACCEPTED` treated as one combined state rather than split into two:

```
REQUESTED → MATCHED_ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED
                             (CANCELLED from REQUESTED or MATCHED_ACCEPTED)
```

Reasoning for keeping them combined: the PRD's own suggested lifecycle already writes them as `MATCHED/ACCEPTED`, i.e. one step. Splitting them would mean inventing an extra "matched but not yet accepted" limbo state the brief never asks for — added complexity without a driving requirement, which Section 9 explicitly discourages ("add complexity only when there is a reason"). Concretely: a request becomes `MATCHED_ACCEPTED` the instant a driver's explicit **Accept** action successfully reserves it a seat (see [Concurrency](#concurrency) below) — matching and accepting happen in the same atomic step, so there's nothing meaningful to separate.

`CANCELLED` is reachable from `REQUESTED` or `MATCHED_ACCEPTED` (passenger-initiated) but not after `STARTED` — once the trip is physically underway, cancelling a completed leg doesn't make sense for an MVP and would need a refund/partial-fare policy the PRD doesn't ask for.

## Driver "accept" semantics

The feature table (Section 3) gives the driver an explicit **"see relevant requests; accept a ride/pool"** action, while the story (Section 1) says the app decides poolability "in about a second." Both are implemented together like this:

- A new `REQUESTED` ride request is immediately visible to any `ONLINE` driver whose vehicle's `current_zone_id` matches the request's pickup zone (that's the "in about a second" part — the *candidate* match is instant and automatic).
- The driver still has to press **Accept** to actually take it. Accepting is the one operation that mutates `pools.occupied_seats`, atomically and capacity-checked (see below) — so "accept" is also literally "reserve the seat," not a rubber stamp on a decision already made elsewhere.
- A second, third (etc.) compatible request can be accepted into the same pool up until `DRIVER_ARRIVED`.

## Concurrency

**The exact scenario from Section 12**: Bullet has 1 seat left (`occupied_seats = capacity - 1`). Two passengers' accept-requests — say Nusrat's and Shirin's — land at nearly the same instant, and both read "1 seat available" before either write happens.

**Solution**: the seat reservation is a single conditional `UPDATE`, not a read-then-write:

```sql
UPDATE pools
SET occupied_seats = occupied_seats + $seats
WHERE id = $poolId
  AND occupied_seats + $seats <= (SELECT capacity FROM vehicles WHERE id = pools.vehicle_id)
```

run inside a Prisma `$transaction`. The database — not application code — is the thing that decides who wins: whichever request's `UPDATE` commits first changes the row, so the second `UPDATE`'s `WHERE` clause no longer matches (capacity would be exceeded) and it affects **zero rows**. The backend checks the affected-row count: `1` → seat reserved, proceed to set the ride request to `MATCHED_ACCEPTED`; `0` → return `409 Conflict ("seat no longer available")` and leave the losing request in `REQUESTED` so the passenger isn't stuck and can be matched elsewhere. There is never a window where both requests can observe "seat available" and both win — the check and the write are the same statement, so no lock has to be held across a round trip.

This needs no explicit row locking (`SELECT ... FOR UPDATE`), no application-level mutex, and no distributed coordination — Postgres's own MVCC guarantees the two concurrent `UPDATE`s serialize against each other on that row. It's covered by an automated test (`concurrency.test.ts`) that fires two accepts at the same pool in parallel and asserts exactly one succeeds and `occupied_seats` never exceeds `capacity`.

**What would change at larger scale**: a single Postgres primary is a single point of write contention once accept-traffic is high enough (thousands of concurrent accepts across many pools is fine — they're different rows — but *the same* wildly popular pool being hammered is a hot-row problem). At that scale I'd move seat reservation to a per-vehicle in-memory sequencer (e.g. a Redis `WATCH`/`MULTI` or a single-threaded queue keyed by `vehicleId`) so Postgres only sees the winning write, with Postgres remaining the durable source of truth. See the [viral-scale bonus](#viral-scale-bonus) below for the fuller picture.

## Fare model

```
passengerFare = baseFare + distanceCharge − poolDiscount
```

- `baseFare` = 2,500 paisa (৳25.00) flat, every ride.
- `distanceCharge` = `round(distanceKm × 1,500 paisa/km)`. `distanceKm` is the haversine great-circle distance between the pickup and destination zone centroids (seeded lat/lng — see [erd.md](erd.md)) — not real road distance, consistent with "you do not need to solve real routing" (Section 3).
- `poolDiscount` = 20% of `(baseFare + distanceCharge)`, applied only if the ride is completed as part of a pool with 2+ active (non-cancelled) members; 0 for a solo ride.
- Rules are applied **per passenger** — each pool member gets their own `distanceCharge` from their own pickup/destination, so two passengers in the same vehicle going different distances correctly get different fares, satisfying "each passenger gets an individual fare."

### Worked example (hand-verifiable, matches the seed data)

| Passenger | Trip | Distance | distanceCharge | baseFare + distanceCharge | Pooled? | Final fare |
|---|---|---:|---:|---:|---|---:|
| Nusrat | Banani → Mohakhali | 1.521 km | round(1.521 × 1500) = 2,281 paisa | 4,781 paisa | yes (20% off) | **3,825 paisa (৳38.25)** |
| Rafiq | Banani → Gulshan 1 | 1.630 km | round(1.630 × 1500) = 2,444 paisa | 4,944 paisa | yes (20% off) | **3,955 paisa (৳39.55)** |

(`4,781 × 0.80 = 3,824.8`, rounded to `3,825`; `4,944 × 0.80 = 3,955.2`, rounded to `3,955`.) These exact figures are asserted in `fare.test.ts` and reproduced in the seed script's console output.

## Why money is stored as integer paisa, not decimal/float

`amount_paisa`, `estimated_fare_paisa`, `final_fare_paisa`, `wallet_balance_paisa` are all `bigint` counts of paisa (1 BDT = 100 paisa), never `float`/`double` and never a `decimal(x,y)` column. Reasons:

- **Floats are unsafe for money** — `0.1 + 0.2 !== 0.3` in IEEE-754; a pooled-fare calculation that quietly loses or gains a paisa over thousands of rides is exactly the kind of bug that's invisible until an audit. Integers have no representation error.
- **Decimal columns work but add friction for no benefit here** — Postgres `numeric` is exact, but every ORM/JS boundary then has to special-case string-vs-number handling (JS has no native arbitrary-precision decimal type, so Prisma returns `Decimal` objects that need explicit conversion before arithmetic or JSON serialization). Since the smallest real unit of BDT currency is the paisa, an integer paisa count already *is* the exact representation — there's no fractional-paisa case to support, so decimal's extra precision buys nothing.
- Integers are trivially `CHECK (amount_paisa >= 0)`-constrainable and compare/sum correctly with plain SQL.

Display formatting (`paisa / 100` → `"৳X.XX"`) happens only at the presentation edge (API response / UI), never before a calculation.

## One vehicle per driver

`vehicles.driver_id` is `UNIQUE`. A real fleet operator might let one driver borrow different vehicles per shift, or one owner run several vehicles with hired drivers — neither is needed to demonstrate pooling/capacity logic, and modeling it "properly" (a `driver_vehicle_assignments` table with an active-shift concept) would be exactly the kind of complexity Section 9 says to avoid without a reason. Noted here as a documented next step, not implemented.

## Viral-scale bonus

See [docs/scaling.md](scaling.md) for the "if Oi Tesla goes viral" reasoning (Section 12 bonus) — kept separate from this file since it's optional and speculative rather than a decision this MVP actually implements.

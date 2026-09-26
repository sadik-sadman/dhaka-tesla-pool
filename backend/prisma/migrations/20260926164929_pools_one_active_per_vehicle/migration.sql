-- One vehicle can only be serving one non-terminal pool (trip) at a time.
-- Enforced at the database level, not just in application code: without
-- this, two concurrent "accept" requests on an otherwise-idle vehicle could
-- each independently decide "no active pool exists yet" and each create
-- their own -- the same class of race the occupied_seats CHECK constraint
-- (see the initial migration) guards against one level up, for the case
-- where a pool doesn't exist yet rather than where it's already full.
-- See docs/decisions.md#concurrency.
CREATE UNIQUE INDEX "pools_one_active_per_vehicle" ON "pools"("vehicle_id")
WHERE "status" IN ('MATCHED_ACCEPTED', 'DRIVER_ARRIVED', 'STARTED');

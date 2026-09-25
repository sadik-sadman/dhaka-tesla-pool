# Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ VEHICLES : "drives (0..1 per driver)"
    USERS ||--o{ RIDE_REQUESTS : "books"
    USERS ||--o{ RIDE_STATUS_HISTORY : "changed_by"
    VEHICLES ||--o{ POOLS : "serves"
    ZONES ||--o{ RIDE_REQUESTS : "pickup_zone"
    ZONES ||--o{ RIDE_REQUESTS : "destination_zone"
    ZONES ||--o{ POOLS : "pickup_zone"
    POOLS ||--o{ RIDE_REQUESTS : "groups"
    RIDE_REQUESTS ||--o{ RIDE_STATUS_HISTORY : "logs"
    RIDE_REQUESTS ||--o| PAYMENTS : "settled by"

    USERS {
        uuid id PK
        string name
        string email UK
        string password_hash
        enum role "PASSENGER | DRIVER"
        bigint wallet_balance_paisa "TeslaPay simulated wallet"
        datetime created_at
        datetime updated_at
    }
    VEHICLES {
        uuid id PK
        uuid driver_id FK "UK — one vehicle per driver, MVP assumption"
        string name "e.g. Bullet"
        int capacity
        enum status "OFFLINE | ONLINE"
        uuid current_zone_id FK "nullable — set when driver goes ONLINE"
        datetime created_at
        datetime updated_at
    }
    ZONES {
        uuid id PK
        string name UK "Banani, Gulshan 1, Mohakhali, ..."
        string corridor "matching group, see decisions.md"
        float lat
        float lng
    }
    POOLS {
        uuid id PK
        uuid vehicle_id FK
        uuid pickup_zone_id FK
        enum status "MATCHED_ACCEPTED | DRIVER_ARRIVED | STARTED | COMPLETED | CANCELLED"
        int occupied_seats "denormalized, updated only via atomic conditional UPDATE"
        datetime driver_arrived_at
        datetime started_at
        datetime completed_at
        datetime created_at
    }
    RIDE_REQUESTS {
        uuid id PK
        uuid passenger_id FK
        uuid pickup_zone_id FK
        uuid destination_zone_id FK
        int seats_requested
        enum status "REQUESTED | MATCHED_ACCEPTED | DRIVER_ARRIVED | STARTED | COMPLETED | CANCELLED"
        uuid pool_id FK "nullable until matched"
        bigint estimated_fare_paisa
        bigint final_fare_paisa "nullable until COMPLETED"
        datetime requested_at
        datetime cancelled_at
        datetime created_at
        datetime updated_at
    }
    RIDE_STATUS_HISTORY {
        uuid id PK
        uuid ride_request_id FK
        enum from_status
        enum to_status
        uuid changed_by FK "user who triggered the transition"
        datetime changed_at
    }
    PAYMENTS {
        uuid id PK
        uuid ride_request_id FK UK
        bigint amount_paisa
        enum method "CASH | TESLAPAY"
        enum status "PENDING | PAID"
        datetime paid_at
    }
```

## Table-by-table notes

**users** — passengers and drivers share one table with a `role` discriminator rather than two separate tables, because auth (email/password/JWT) is identical for both and the only divergence is "does this user own a vehicle." A driver is simply a user with a row in `vehicles`. `wallet_balance_paisa` backs the simulated TeslaPay payment method.

**vehicles** — `driver_id` is unique, encoding the MVP assumption "one driver owns exactly one Tesla" (documented per Section 17 — real fleets would be many-to-many via a separate `driver_vehicle` assignment table; not needed to demonstrate the pooling/capacity logic this challenge grades). `current_zone_id` is set when a driver goes `ONLINE` and is what the matching service uses to decide which pending requests are "relevant" to this driver.

**zones** — a small, predefined, seeded list (Banani, Gulshan 1, Gulshan 2, Mohakhali, Dhanmondi, Mirpur, Uttara, Farmgate, Bashundhara). No map API. `corridor` is the invented matching-compatibility grouping explained in [decisions.md](decisions.md#matching-rule); `lat`/`lng` are approximate neighborhood centroids used only for the haversine distance in the fare calculation, never for real routing.

**pools** — one row per "vehicle currently serving 1+ ride requests together." Created the moment a driver accepts the first request; subsequent compatible requests join the same pool until the driver marks `DRIVER_ARRIVED`, which closes the pooling window. `occupied_seats` is the single counter guarded by the capacity-safe atomic update (see [decisions.md](decisions.md#concurrency)) — it is never written by anything except that one code path, so it can't drift from reality.

**ride_requests** — one row per passenger's booking. `status` follows the PRD's suggested lifecycle exactly (`REQUESTED → MATCHED_ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED`, or `CANCELLED`). `pool_id` is null while a request is still waiting for a driver to accept it.

**ride_status_history** — append-only audit trail. Every status change (including cancellation) writes one row here with who triggered it and when — this is what lets the system "hold onto enough history to explain exactly what happened, in case anyone asks later" (Section 2), and doubles as the audit log the tooling notes call out as optional.

**payments** — one row per completed ride request, `method` chosen at request time (cash or simulated TeslaPay), `status` flips to `PAID` on completion (TeslaPay debits `users.wallet_balance_paisa` atomically in the same transaction; cash is marked paid without touching the wallet).

## Constraints & indexes (enforced in the Prisma schema, not just in application code)

- `vehicles.driver_id` — `UNIQUE`
- `payments.ride_request_id` — `UNIQUE`
- `zones.name` — `UNIQUE`
- `users.email` — `UNIQUE`
- Foreign keys everywhere above are real FK constraints (`onDelete: Restrict` for historical tables like `ride_status_history`/`payments` so a user/ride can't be deleted out from under its own audit trail)
- Index on `ride_requests(status, pickup_zone_id)` — the exact lookup the matching service runs on every new request
- Index on `ride_requests(passenger_id)` and `pools(vehicle_id, status)` — history/dashboard queries
- `CHECK` constraint `pools.occupied_seats >= 0` at the DB level as a last line of defense, in addition to the application-level atomic update that should always keep it within `[0, vehicle.capacity]`

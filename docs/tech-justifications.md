# Technology choices — what, why, and what the alternative would have cost

This file exists so the person who submits this project can defend every choice in it without notes. The PRD says so directly (Section 7: "a trendy stack you can't defend earns nothing extra — and will cost you in the interview when we ask why") and the evaluation rubric scores "Ownership" as its own axis: *can explain, defend, and change your own code*.

Each entry below follows the same shape, a format borrowed from a real industry practice called an **Architecture Decision Record (ADR)** — a short, permanent note written at the moment a decision is made, so six months later (or in an interview) nobody has to reconstruct *why* from memory:

> **Picked** — what we're using
> **Alternatives seriously considered** — what else was on the table, and what each one actually is
> **Why this one fits *this* project** — the specific reasoning, not a generic "it's popular"
> **What would make me switch** — the concrete condition under which the decision should be revisited
> **Trade-off accepted** — the honest cost of this choice, stated plainly

If you only remember one sentence from this file: **every row below has a real runner-up that was rejected for a stated reason, not because it's bad — that's the whole point of an ADR.**

---

## 1. Frontend framework — Next.js (App Router)

**Picked**: Next.js 14+, App Router, TypeScript, React.

**Alternatives seriously considered**:
- **Plain React + React Router** (a hand-assembled SPA, e.g. via Vite) — explicitly allowed by the PRD ("React or Next.js").
- **Remix** — a different React meta-framework, similar pitch to Next.js (server rendering, nested routing, loaders/actions).

**Why this fits here**: the PRD names Next.js App Router as its own recommendation ("recommended for routing/SSR"), and this app genuinely has two distinct dashboards (passenger, driver) with server-renderable initial state (my active ride, my history) — file-based routing plus server components removes a whole class of "which router library, how do I code-split, how do I avoid a loading spinner on first paint" decisions that a plain React SPA would otherwise need answered from scratch.

**What would make me switch**: if this were a single-page, highly interactive real-time dashboard with no need for SSR/SEO and a team already fluent in a specific SPA toolchain, plain React + Vite would be lighter-weight and have a shorter build time. Remix would be a lateral move, not really a switch — the reasoning that picked Next.js over a bare SPA mostly applies to Remix too.

**Trade-off accepted**: Next.js's App Router has real learning-curve edges (server vs client components, where `"use client"` has to go) that a plain SPA doesn't — more framework to know, for the SSR/routing convenience gained.

---

## 2. Backend framework — Express, not NestJS or Fastify

**Picked**: Express 5, TypeScript, hand-organized in layers (`routes → controllers → services → Prisma`).

**Alternatives seriously considered** (both explicitly named as acceptable by the PRD):
- **NestJS** — a full "batteries-included" Node framework built on top of Express or Fastify. It gives you dependency injection, decorator-based routing (`@Controller`, `@Get`), and a module system (`AuthModule`, `RidesModule`) enforced by the framework itself, not just by convention.
- **Fastify** — a lower-level framework like Express, but built for raw throughput (schema-based JSON serialization, a faster routing engine).

**Why this fits here**: NestJS's whole value proposition is *enforcing* structure across a codebase with many contributors over a long lifetime — the DI container and module boundaries stop people from reaching around them. For one developer building one MVP under a deadline, that enforcement is mostly ceremony: the same `routes → controllers → services` layering is achievable by hand in Express with zero framework magic to debug, which matters a lot for the exact thing this project needs to get right under time pressure — the capacity-safe transaction in the pooling logic (see [decisions.md](decisions.md#concurrency)). Debugging *"is this transaction boundary wrong, or is Nest's request-scoped-provider lifecycle doing something I don't expect"* is a worse use of limited time than just writing the transaction directly. Fastify was the closer call — it's a legitimate throughput upgrade over Express — but its ecosystem for this specific need (Express has thousands of StackOverflow answers for every edge case; Fastify has fewer) made Express the safer bet to get *correct* quickly, which matters more than raw req/sec for an MVP with three seed passengers.

**What would make me switch**: growing past one developer into a team, or the surface area growing past a dozen or so route modules — that's exactly the scale where NestJS's enforced structure starts paying for its ceremony. A measured throughput problem (not a hypothetical one) would be the trigger for Fastify.

**Trade-off accepted**: Express gives you nothing for free — no DI, no built-in validation pipes, no enforced module boundaries. All of that (validation middleware, the layered folder structure, typed errors) had to be built by hand in this repo (`src/middleware/validate.ts`, `src/lib/errors.ts`) instead of coming from the framework.

---

## 3. Database — PostgreSQL, not MySQL or SQLite

**Picked**: PostgreSQL 16.

**Alternatives seriously considered** (all three explicitly named by the PRD as acceptable — "Postgres/MySQL/SQLite"):
- **MySQL** — the other mainstream relational database; broadly similar feature set to Postgres for a project this size.
- **SQLite** — a whole database engine that lives in a single file, no server process at all.

**Why this fits here**: the domain is unavoidably relational (a vehicle has a hard-capacity constraint, a pool has members, a ride references a passenger and two zones by foreign key) and the one correctness property this whole challenge is graded on — the seat-capacity race in [decisions.md](decisions.md#concurrency) — is a concurrent-write problem. SQLite's storage engine serializes writes at the *whole-database-file* level (even in WAL mode, only one writer commits at a time), which would make the "two requests race for the last seat" scenario trivially safe *for the wrong reason* — the file lock would serialize it whether or not the application-level logic was correct, which defeats the point of demonstrating the fix. Postgres's MVCC lets two transactions actually run concurrently and lets the database itself pick the winner on the contested row via the conditional `UPDATE`, which is the real mechanism the PRD is asking to see. MySQL would have solved that problem about as well as Postgres — the deciding factor over MySQL specifically was Postgres's stricter native types (real `ENUM`, `CHECK` constraints, `UUID`) mapping more directly onto the schema in [erd.md](erd.md) without extra application-level enforcement.

**What would make me switch**: SQLite is genuinely the right call for a local CLI tool, a mobile app's on-device store, or a low-write read-mostly service — none of which describes a multi-writer ride-pooling backend. MySQL would be a reasonable switch only for a company-specific operational reason (existing MySQL fleet/expertise), not a technical one for this project.

**Trade-off accepted**: Postgres needs a running server process (a real deployment dependency: a docker service, or a managed instance in production) where SQLite would have needed nothing at all. This is exactly the cost the previous paragraph says is worth paying here.

---

## 4. ORM — Prisma

**Picked**: Prisma ORM (classic CLI, pinned to major version 6 — see the note below).

**Alternatives seriously considered**:
- **Drizzle ORM** — a newer, more "just SQL with types" ORM: you write something close to raw SQL and get type inference back, with less code generation/magic than Prisma.
- **TypeORM** — an older, decorator-based ORM (`@Entity`, `@Column`), architecturally closer to Java's Hibernate.
- **Raw SQL** (via a plain driver like `pg` or a query builder like `Knex`) — no ORM at all.

**Why this fits here**: this project needs to *show* its schema clearly (the ERD is a scored deliverable) and needs real migrations with real history (Section 10 grades git/migration history, not just a final `db.sql` dump) — Prisma's schema file *is* the ERD in a very literal sense (this project's `schema.prisma` and `docs/erd.md` describe the exact same model on purpose), and `prisma migrate diff` generated the initial migration SQL for review before anything ever touched a database. Prisma's `$transaction` API is also exactly what the capacity-safe conditional `UPDATE` needs.

**What would make me switch**: Drizzle is the one to watch — for a team that wants SQL-level control with less generated-code overhead, it's a strong, currently-trending choice, and would be a reasonable pick if starting today with more Postgres-specific SQL in mind. Raw SQL/Knex would only make sense if the query patterns became complex enough that Prisma's query API stopped being a net time-saver.

**Trade-off accepted**: Prisma's generated client is a black box compared to hand-written SQL — when something goes wrong, you're debugging through Prisma's abstraction, not your own query.

**A concrete lesson from building this, worth being able to tell in the interview**: Prisma's newest major version (7.x) turned out to have replaced the classic self-hosted CLI (`prisma migrate dev`, `prisma generate`) with an entirely different cloud-platform CLI (`prisma project`, `prisma branch`, `prisma deploy` — Prisma's own hosted "Postgres branches per git branch" product). That's a fine product for teams who want Prisma to host their database, but it doesn't fit "a plain `docker-compose.yml` with our own Postgres container," which is what this PRD asks for. Rather than force-fit an unfamiliar cloud-first CLI into a self-hosted deployment story, this project pins `prisma`/`@prisma/client` to the `6.x` line, which still has the classic, widely-documented migration workflow. **This is a real example of "what would make you switch later" (Section 7) running in reverse** — a major version upgrade turned out to be the wrong fit for this deployment shape, so the fix was a deliberate, documented downgrade, not a silent one.

---

## 5. Authentication — JWT, not server-side sessions

**Picked**: Stateless JWT bearer tokens (`Authorization: Bearer <token>`), signed with a symmetric secret, `bcryptjs` for password hashing.

**Alternatives seriously considered**:
- **Server-side sessions** — the server generates a random session ID, stores session state (who's logged in) in memory or a session store (e.g. Redis), and gives the browser that ID in a cookie.
- **`bcrypt` (native) instead of `bcryptjs`** — the more commonly recommended password-hashing library.
- **`argon2`** — a newer, generally considered even stronger password-hashing algorithm than bcrypt.

**Why this fits here**: sessions require the server to hold state per logged-in user somewhere (memory, or an extra Redis dependency) — a JWT instead carries its own validity and role claim, so any backend instance can verify a request with zero shared state, which is also *why* the [scaling writeup](scaling.md) can add more API instances behind a load balancer with no sticky-session problem to solve later. On hashing: `bcrypt` (native) needs a C++ compiler toolchain to install (it failed to build cleanly in this exact sandbox during development — see the auth commits), which is a real, reproducible portability problem between a Windows dev machine and a Linux Docker container; `bcryptjs` is a pure-JavaScript reimplementation of the same algorithm with the same security properties and no native build step at all, which removed that whole failure mode.

**What would make me switch**: sessions become the better choice the moment you need to *revoke* a single login instantly (a stolen-token / "log out everywhere" requirement) — a JWT is valid until it expires, full stop, unless you build a token-blocklist (which is most of the complexity of sessions, with extra steps). `argon2` would be the switch for password hashing if this were a fresh greenfield decision with no portability constraint — it's a legitimate security upgrade over bcrypt; it wasn't picked here because the portability win from `bcryptjs` mattered more at MVP scale, and bcrypt's security margin is still considered adequate.

**Trade-off accepted**: no instant token revocation (documented above), and a JWT is bigger on the wire than a session ID cookie — irrelevant at this scale, worth knowing as a limit.

---

## 6. Validation — Zod

**Picked**: Zod schemas (`signupSchema`, `loginSchema`, ...), parsed in `validateBody` middleware before a controller ever sees `req.body`.

**Alternatives seriously considered**:
- **Joi** — an older, very established JS validation library, schema objects but no static type inference.
- **class-validator** (decorator-based, e.g. `@IsEmail()`) — the validation approach NestJS uses natively.

**Why this fits here**: Zod's schema *is* the TypeScript type (`z.infer<typeof signupSchema>`) — one definition instead of a separate interface plus a separate validator that could drift out of sync. The `signupSchema` discriminated union (Section 17 assumption: a driver's vehicle is created with their account) is a good example: the type system itself refuses to compile code that reads `vehicleName` off a passenger signup, because Zod encoded that constraint once, at the schema level.

**What would make me switch**: class-validator only makes sense paired with NestJS's decorator style (see entry 2) — not a fit for an Express project by itself. Joi remains a fine choice; it just doesn't give the static-type inference Zod does "for free."

**Trade-off accepted**: Zod's discriminated-union error messages are less polished out of the box than a hand-written validator's would be (see the manual formatting in `validateBody`).

---

## 7. API style — REST, not GraphQL

**Picked**: plain REST endpoints returning JSON (`POST /api/auth/signup`, etc.).

**Alternatives seriously considered**:
- **GraphQL** — a single endpoint where the client specifies exactly which fields it wants back, across possibly-nested relations, in one request.

**Why this fits here**: GraphQL earns its complexity when clients have deeply variable, nested data needs (mobile app wants less data than web app wants less than an admin dashboard) — this app has a small, fixed set of views (my active ride, my history, driver's relevant requests) that map cleanly onto a handful of REST endpoints. Reaching for GraphQL here would mean paying for a query language, a resolver layer, and a schema stitching story to solve a problem this app doesn't have.

**What would make me switch**: multiple very different client types (web, mobile, a partner API) each needing different slices of the same underlying data would be the actual trigger.

**Trade-off accepted**: a client that only wants one field off `/api/auth/me` still gets the whole object — a non-issue at this response size, a real cost at a much larger one.

---

## 8. Testing — Jest, not Vitest or Mocha

**Picked**: Jest + ts-jest + Supertest (HTTP-level integration tests).

**Alternatives seriously considered**:
- **Vitest** — a newer test runner built for Vite-based projects, generally faster than Jest, near-drop-in-compatible API.
- **Mocha + Chai** — an older, more "assemble it yourself" combination (test runner + assertion library as separate packages).

**Why this fits here**: Jest is the default/most-documented choice for a plain Node + TypeScript backend (not a Vite frontend project, where Vitest's speed advantage actually shows up), has first-class Supertest integration for exactly the HTTP-level tests this project needs (hit a real Express route, assert the JSON response), and needed zero extra pieces beyond `ts-jest` for TypeScript support.

**What would make me switch**: if the backend were built with Vite as its bundler (it isn't — it's plain `tsc`), Vitest's speed and native ESM support would be the more natural fit.

**Trade-off accepted**: Jest is measurably slower than Vitest on large suites; irrelevant at this project's test-suite size.

---

## 9. Auth token storage (frontend) — localStorage, not an httpOnly cookie

**Picked**: the JWT and public user object are kept in `localStorage` (`lib/auth-context.tsx`), attached as an `Authorization: Bearer` header on every API call.

**Alternatives seriously considered**:
- **httpOnly cookie** — the browser stores the token in a cookie JavaScript can't read; the backend sets it via `Set-Cookie` and reads it automatically on every request.

**Why this fits here**: the frontend and backend are two separate deployables on two separate origins (see [architecture.md](architecture.md#environments)) — a cookie-based session means configuring `SameSite`/CORS credentials and (in production, cross-domain) either a shared parent domain or a proxy, none of which the app otherwise needs. `localStorage` + an explicit header works identically regardless of where each piece ends up deployed, with zero cookie/CORS-credentials configuration.

**What would make me switch**: an httpOnly cookie is the meaningfully more secure choice the moment this handles real money or real personal data at real user scale — `localStorage` is readable by any JavaScript that runs on the page, so a successful XSS anywhere in the app (including a compromised third-party script) can steal the token outright, where a cookie at least keeps it out of reach of page-level JS. For a graded MVP demo with a simulated wallet and no real payment gateway, that risk is accepted; it wouldn't be for a real production ride-pooling app.

**Trade-off accepted**: no CSRF protection is needed *because* of this choice (a cookie would need it), but the app is correspondingly more exposed to token theft via XSS than a cookie-based design would be.

---

## 10. Dashboard updates — completion-scheduled polling with plain `fetch`

**Picked**: browser `fetch` plus a four-second poll for passenger, driver, and profile state. Each page waits for one poll cycle to finish before scheduling the next; independent resources (dashboard, history, zones, profile) load in parallel, and a monotonically increasing request sequence prevents a manual post-action refresh from being overwritten by an older response. Live authenticated reads use `cache: "no-store"`.

**Alternatives seriously considered**:
- **WebSocket or Server-Sent Events (SSE)** — the backend pushes a status change as soon as it happens instead of waiting for the next poll.
- **TanStack Query / SWR** — a client data library that supplies caching, request deduplication, background revalidation, retries, and query invalidation.

**Why this fits here**: the PRD asks for live status tracking but explicitly warns against adding infrastructure without a reason. At this MVP's scale, a four-second delay is acceptable and plain `fetch` keeps the request path visible to a reviewer. The scheduling detail is a correctness choice, not just an optimization: `setInterval` can start a second multi-request refresh while the first is still running. On a slow machine, each new tick can invalidate the previous tick before any one cycle publishes a complete dashboard, leaving the vehicle card permanently loading after a page refresh. Scheduling the next tick only after completion removes that starvation case. Parallel resource reads also mean a slow ride-history response cannot hide an otherwise healthy vehicle response. `no-store` prevents back/forward navigation from presenting a cached online/offline snapshot as current state.

**What would make me switch**: real dispatch at production scale, where a driver-arrived or trip-started event should reach many connected clients immediately and polling from thousands of open dashboards would create waste. SSE is the likely first switch for one-way status delivery; WebSockets become worthwhile if clients also need a persistent bidirectional channel. TanStack Query becomes attractive once the frontend has enough distinct server state and mutations that hand-maintained invalidation is harder to reason about than the added dependency.

**Trade-off accepted**: status can be up to roughly four seconds old, and every open dashboard makes periodic requests even when nothing changes. The implementation also owns its small amount of refresh coordination rather than delegating it to a data library.

---

## 11. Frontend styling — Tailwind CSS without a component library

**Picked**: Tailwind CSS utility classes with a small set of project-owned components (`FormField`, `StatusBadge`, and the dashboard cards).

**Alternatives seriously considered**:
- **A component library** such as Material UI or Chakra UI — ready-made accessible form controls, dialogs, themes, and layout primitives.
- **CSS Modules** — locally scoped authored CSS files, with semantic class names and no runtime dependency.

**Why this fits here**: the interface is intentionally small and task-focused. Tailwind makes responsive and dark-mode states explicit next to the markup while avoiding a design-system dependency whose default visual identity would dominate a compact take-home project. Project-owned cards and badges keep the driver/passenger surfaces consistent without pretending the MVP needs a full component system.

**What would make me switch**: a substantially larger UI with complex dialogs, tables, date pickers, or a multi-developer design system. At that point, an accessible headless component library plus shared design tokens would prevent duplicated interaction work.

**Trade-off accepted**: utility-heavy `className` values are more verbose in JSX, and consistency depends on the project's own small components and review discipline rather than a library enforcing it.

*This file is kept in sync with what's actually implemented — every time a new non-trivial technical decision gets made in this build, it gets its own entry here alongside the code, not bolted on at the end.*

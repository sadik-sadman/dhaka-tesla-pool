import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../../app";
import { setPrismaClient } from "../../lib/prisma";
import { startTestDatabase, TestDatabase } from "../../test/db";

// Same zones/corridors as prisma/seed.ts: Banani, Gulshan 1 and Mohakhali
// all sit in the "gulshan_banani" corridor, which is what makes Nusrat's
// and Rafiq's overlapping-but-not-identical trip poolable. Dhanmondi is a
// different corridor entirely, used below as the "not compatible" case.
async function seedZones(prisma: PrismaClient) {
  const [banani, gulshan1, mohakhali, dhanmondi] = await Promise.all([
    prisma.zone.create({ data: { name: "Banani", corridor: "gulshan_banani", lat: 23.7937, lng: 90.4066 } }),
    prisma.zone.create({ data: { name: "Gulshan 1", corridor: "gulshan_banani", lat: 23.7808, lng: 90.4142 } }),
    prisma.zone.create({ data: { name: "Mohakhali", corridor: "gulshan_banani", lat: 23.7806, lng: 90.4023 } }),
    prisma.zone.create({ data: { name: "Dhanmondi", corridor: "central", lat: 23.7461, lng: 90.3742 } }),
  ]);
  return { banani, gulshan1, mohakhali, dhanmondi };
}

async function signup(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  const res = await request(app).post("/api/auth/signup").send(body);
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { token: string; user: { id: string } };
}

describe("tesla-pooling (real Postgres-wire-protocol database)", () => {
  let testDb: TestDatabase;
  let prisma: PrismaClient;
  let zones: Awaited<ReturnType<typeof seedZones>>;
  const app = createApp();

  beforeAll(async () => {
    testDb = await startTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: testDb.databaseUrl });
    setPrismaClient(prisma);
    // Zones are seeded once and reused across every test below (unlike
    // users/vehicles, which each test creates fresh with unique emails) --
    // zone names are unique, so re-seeding per test would collide.
    zones = await seedZones(prisma);
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await testDb.stop();
  }, 30000);

  it("pools Nusrat and Rafiq's overlapping-but-not-identical trip, per docs/decisions.md#matching-rule", async () => {

    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.matching@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.matching@test.local",
      password: "supersecret",
    });
    const rafiq = await signup(app, {
      role: "PASSENGER",
      name: "Rafiq",
      email: "rafiq.matching@test.local",
      password: "supersecret",
    });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusratRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);

    const rafiqRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rafiq.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.gulshan1.id, seatsRequested: 1 })
      .expect(201);

    const relevant = await request(app)
      .get("/api/driver/requests")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);
    expect(relevant.body).toHaveLength(2);

    const nusratAccept = await request(app)
      .post(`/api/driver/requests/${nusratRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);
    const poolId = nusratAccept.body.poolId;
    expect(poolId).toBeTruthy();

    const rafiqAccept = await request(app)
      .post(`/api/driver/requests/${rafiqRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    // Same pool, despite different destinations -- that's the whole point.
    expect(rafiqAccept.body.poolId).toBe(poolId);

    const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
    expect(pool.occupiedSeats).toBe(2);
  });

  it("does not pool a request whose destination corridor is incompatible", async () => {

    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.incompatible@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.incompatible@test.local",
      password: "supersecret",
    });
    const outlier = await signup(app, {
      role: "PASSENGER",
      name: "Outlier",
      email: "outlier.incompatible@test.local",
      password: "supersecret",
    });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusratRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);
    await request(app)
      .post(`/api/driver/requests/${nusratRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    // Same pickup zone, but Dhanmondi is a different corridor from Mohakhali.
    const outlierRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${outlier.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.dhanmondi.id, seatsRequested: 1 })
      .expect(201);

    const outlierAccept = await request(app)
      .post(`/api/driver/requests/${outlierRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .send();
    expect(outlierAccept.status).toBe(409);
  });

  it("rejects an accept once the vehicle is at full capacity", async () => {

    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.capacity@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 1,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.capacity@test.local",
      password: "supersecret",
    });
    const rafiq = await signup(app, {
      role: "PASSENGER",
      name: "Rafiq",
      email: "rafiq.capacity@test.local",
      password: "supersecret",
    });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusratRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);
    await request(app)
      .post(`/api/driver/requests/${nusratRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    const rafiqRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rafiq.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);

    const rafiqAccept = await request(app)
      .post(`/api/driver/requests/${rafiqRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .send();
    expect(rafiqAccept.status).toBe(409);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { driverId: jashim.user.id } });
    const pool = await prisma.pool.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
    expect(pool.occupiedSeats).toBe(1);
  });

  it("Section 12's exact scenario: Bullet has 1 seat left, Nusrat and Shirin race for it -- exactly one wins, capacity is never exceeded", async () => {

    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.concurrency@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const filler1 = await signup(app, { role: "PASSENGER", name: "Filler1", email: "filler1.concurrency@test.local", password: "supersecret" });
    const filler2 = await signup(app, { role: "PASSENGER", name: "Filler2", email: "filler2.concurrency@test.local", password: "supersecret" });
    const nusrat = await signup(app, { role: "PASSENGER", name: "Nusrat", email: "nusrat.concurrency@test.local", password: "supersecret" });
    const shirin = await signup(app, { role: "PASSENGER", name: "Shirin", email: "shirin.concurrency@test.local", password: "supersecret" });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    // Fill 2 of Bullet's 3 seats first, so exactly 1 remains.
    for (const passenger of [filler1, filler2]) {
      const req_ = await request(app)
        .post("/api/rides")
        .set("Authorization", `Bearer ${passenger.token}`)
        .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
        .expect(201);
      await request(app)
        .post(`/api/driver/requests/${req_.body.id}/accept`)
        .set("Authorization", `Bearer ${jashim.token}`)
        .expect(200);
    }

    const nusratRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);
    const shirinRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${shirin.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);

    // Both initially see one seat available (Section 12) -- fire both
    // accepts at nearly the same instant.
    const [nusratOutcome, shirinOutcome] = await Promise.all([
      request(app)
        .post(`/api/driver/requests/${nusratRequest.body.id}/accept`)
        .set("Authorization", `Bearer ${jashim.token}`)
        .send(),
      request(app)
        .post(`/api/driver/requests/${shirinRequest.body.id}/accept`)
        .set("Authorization", `Bearer ${jashim.token}`)
        .send(),
    ]);

    const outcomes = [nusratOutcome.status, shirinOutcome.status].sort();
    expect(outcomes).toEqual([200, 409]);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { driverId: jashim.user.id } });
    const pool = await prisma.pool.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
    expect(pool.occupiedSeats).toBe(3); // never 4
  });

  it("a passenger cannot cancel another passenger's ride", async () => {
    const nusrat = await signup(app, { role: "PASSENGER", name: "Nusrat", email: "nusrat.ownership@test.local", password: "supersecret" });
    const rafiq = await signup(app, { role: "PASSENGER", name: "Rafiq", email: "rafiq.ownership@test.local", password: "supersecret" });

    const nusratRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);

    const rafiqTriesToCancelNusrat = await request(app)
      .post(`/api/rides/${nusratRequest.body.id}/cancel`)
      .set("Authorization", `Bearer ${rafiq.token}`)
      .send();
    expect(rafiqTriesToCancelNusrat.status).toBe(404);

    const stillActive = await prisma.rideRequest.findUniqueOrThrow({ where: { id: nusratRequest.body.id } });
    expect(stillActive.status).toBe("REQUESTED");
  });

  it("cancellation frees the seat it was holding, and cannot cancel a started ride", async () => {
    const jashim = await signup(app, { role: "DRIVER", name: "Jashim", email: "jashim.cancel@test.local", password: "supersecret", vehicleName: "Bullet", vehicleCapacity: 3 });
    const nusrat = await signup(app, { role: "PASSENGER", name: "Nusrat", email: "nusrat.cancel@test.local", password: "supersecret" });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusratRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);
    const accepted = await request(app)
      .post(`/api/driver/requests/${nusratRequest.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    await request(app)
      .post(`/api/rides/${nusratRequest.body.id}/cancel`)
      .set("Authorization", `Bearer ${nusrat.token}`)
      .expect(200);

    const pool = await prisma.pool.findUniqueOrThrow({ where: { id: accepted.body.poolId } });
    expect(pool.occupiedSeats).toBe(0);

    // Cancel-after-STARTED should be rejected -- move the pool to STARTED
    // directly (the arrived/started endpoints are a later chunk) and
    // confirm a second request in the same pool can no longer be cancelled.
    await prisma.pool.update({ where: { id: pool.id }, data: { status: "STARTED" } });
    const secondRequest = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, seatsRequested: 1 })
      .expect(201);
    await prisma.rideRequest.update({
      where: { id: secondRequest.body.id },
      data: { status: "STARTED", poolId: pool.id },
    });

    const cancelStarted = await request(app)
      .post(`/api/rides/${secondRequest.body.id}/cancel`)
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send();
    expect(cancelStarted.status).toBe(403);
  });
});

import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../../app";
import { setPrismaClient } from "../../lib/prisma";
import { startTestDatabase, TestDatabase } from "../../test/db";

async function seedZones(prisma: PrismaClient) {
  const [banani, gulshan1, mohakhali] = await Promise.all([
    prisma.zone.create({ data: { name: "Banani", corridor: "gulshan_banani", lat: 23.7937, lng: 90.4066 } }),
    prisma.zone.create({ data: { name: "Gulshan 1", corridor: "gulshan_banani", lat: 23.7808, lng: 90.4142 } }),
    prisma.zone.create({ data: { name: "Mohakhali", corridor: "gulshan_banani", lat: 23.7806, lng: 90.4023 } }),
  ]);
  return { banani, gulshan1, mohakhali };
}

async function signup(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  const res = await request(app).post("/api/auth/signup").send(body);
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { token: string; user: { id: string } };
}

describe("driver lifecycle: arrived -> started -> completed (real Postgres-wire-protocol database)", () => {
  let testDb: TestDatabase;
  let prisma: PrismaClient;
  let zones: Awaited<ReturnType<typeof seedZones>>;
  const app = createApp();

  beforeAll(async () => {
    testDb = await startTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: testDb.databaseUrl });
    setPrismaClient(prisma);
    zones = await seedZones(prisma);
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await testDb.stop();
  }, 30000);

  it("rejects out-of-order transitions and a transition with no active pool", async () => {
    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.lifecycle-order@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });

    const noPool = await request(app)
      .post("/api/driver/pool/arrived")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send();
    expect(noPool.status).toBe(404);

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.lifecycle-order@test.local",
      password: "supersecret",
    });
    const rideReq = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id })
      .expect(201);
    await request(app)
      .post(`/api/driver/requests/${rideReq.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    // Pool is MATCHED_ACCEPTED -- start/complete out of order must fail.
    const startTooEarly = await request(app)
      .post("/api/driver/pool/start")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send();
    expect(startTooEarly.status).toBe(409);

    const completeTooEarly = await request(app)
      .post("/api/driver/pool/complete")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send();
    expect(completeTooEarly.status).toBe(409);

    await request(app)
      .post("/api/driver/pool/arrived")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    // Now DRIVER_ARRIVED -- arriving again, or completing, must still fail.
    const arriveTwice = await request(app)
      .post("/api/driver/pool/arrived")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send();
    expect(arriveTwice.status).toBe(409);
  });

  it("finalizes a pooled trip's fares to the exact hand-verified numbers on completion", async () => {
    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.lifecycle-pooled@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.lifecycle-pooled@test.local",
      password: "supersecret",
    });
    const rafiq = await signup(app, {
      role: "PASSENGER",
      name: "Rafiq",
      email: "rafiq.lifecycle-pooled@test.local",
      password: "supersecret",
    });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusratReq = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id, paymentMethod: "CASH" })
      .expect(201);
    const rafiqReq = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${rafiq.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.gulshan1.id, paymentMethod: "TESLAPAY" })
      .expect(201);

    await request(app).post(`/api/driver/requests/${nusratReq.body.id}/accept`).set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post(`/api/driver/requests/${rafiqReq.body.id}/accept`).set("Authorization", `Bearer ${jashim.token}`).expect(200);

    await request(app).post("/api/driver/pool/arrived").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post("/api/driver/pool/start").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    const completed = await request(app)
      .post("/api/driver/pool/complete")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    const nusratFinal = completed.body.find((r: { id: string }) => r.id === nusratReq.body.id);
    const rafiqFinal = completed.body.find((r: { id: string }) => r.id === rafiqReq.body.id);
    expect(nusratFinal.status).toBe("COMPLETED");
    expect(nusratFinal.finalFarePaisa).toBe("3825"); // BDT 38.25, pooled
    expect(rafiqFinal.finalFarePaisa).toBe("3955"); // BDT 39.55, pooled

    const nusratPayment = await prisma.payment.findUniqueOrThrow({ where: { rideRequestId: nusratReq.body.id } });
    expect(nusratPayment.method).toBe("CASH");
    expect(nusratPayment.status).toBe("PAID");
    expect(nusratPayment.amountPaisa).toBe(3825n);

    const rafiqUser = await prisma.user.findUniqueOrThrow({ where: { id: rafiq.user.id } });
    expect(rafiqUser.walletBalancePaisa).toBe(-3955n); // TeslaPay debited from a zero starting balance

    const history = await prisma.rideStatusHistory.findMany({ where: { rideRequestId: nusratReq.body.id }, orderBy: { changedAt: "asc" } });
    expect(history.map((h) => h.toStatus)).toEqual([
      "MATCHED_ACCEPTED",
      "DRIVER_ARRIVED",
      "STARTED",
      "COMPLETED",
    ]);

    // No real routing/drop-off order is modeled (docs/decisions.md#driver-location)
    // -- Rafiq's destination (Gulshan 1, 1.630km) is farther from Banani than
    // Nusrat's (Mohakhali, 1.521km), so the vehicle's current zone should now
    // be Gulshan 1, not left stale at the pickup zone.
    const jashimVehicle = await prisma.vehicle.findUniqueOrThrow({ where: { driverId: jashim.user.id } });
    expect(jashimVehicle.currentZoneId).toBe(zones.gulshan1.id);

    // Cash has no wallet -- GET /me reports a lifetime total instead (see
    // auth.service.ts#getCashTotalPaisa). Only Nusrat paid cash (3825);
    // Rafiq paid TeslaPay, so it shouldn't count towards anyone's cash total.
    const nusratMe = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${nusrat.token}`).expect(200);
    expect(nusratMe.body.cashTotalPaisa).toBe("3825");

    const jashimMe = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    expect(jashimMe.body.cashTotalPaisa).toBe("3825");

    const rafiqMe = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${rafiq.token}`).expect(200);
    expect(rafiqMe.body.cashTotalPaisa).toBe("0");
  });

  it("a solo (unpooled) trip is charged the full fare, no discount", async () => {
    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.lifecycle-solo@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.lifecycle-solo@test.local",
      password: "supersecret",
    });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);

    const nusratReq = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id })
      .expect(201);
    await request(app).post(`/api/driver/requests/${nusratReq.body.id}/accept`).set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post("/api/driver/pool/arrived").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post("/api/driver/pool/start").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    const completed = await request(app)
      .post("/api/driver/pool/complete")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    expect(completed.body[0].finalFarePaisa).toBe("4781"); // BDT 47.81, solo (no pool discount)
  });

  it("GET /api/driver/history shows completed trips, and only this driver's own", async () => {
    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.history@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const otherDriver = await signup(app, {
      role: "DRIVER",
      name: "OtherDriver",
      email: "other.history@test.local",
      password: "supersecret",
      vehicleName: "OtherCar",
      vehicleCapacity: 2,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.history@test.local",
      password: "supersecret",
    });

    const emptyHistory = await request(app)
      .get("/api/driver/history")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);
    expect(emptyHistory.body).toHaveLength(0);

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);
    const nusratReq = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id })
      .expect(201);
    await request(app).post(`/api/driver/requests/${nusratReq.body.id}/accept`).set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post("/api/driver/pool/arrived").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post("/api/driver/pool/start").set("Authorization", `Bearer ${jashim.token}`).expect(200);
    await request(app).post("/api/driver/pool/complete").set("Authorization", `Bearer ${jashim.token}`).expect(200);

    const history = await request(app)
      .get("/api/driver/history")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].pickupZone.name).toBe("Banani");
    expect(history.body[0].rideRequests[0].passenger.name).toBe("Nusrat");
    expect(history.body[0].rideRequests[0].finalFarePaisa).toBe("4781");

    const otherDriverHistory = await request(app)
      .get("/api/driver/history")
      .set("Authorization", `Bearer ${otherDriver.token}`)
      .expect(200);
    expect(otherDriverHistory.body).toHaveLength(0);
  });

  it("a driver cannot arrive, start, or complete another driver's active pool", async () => {
    const jashim = await signup(app, {
      role: "DRIVER",
      name: "Jashim",
      email: "jashim.isolation@test.local",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    const otherDriver = await signup(app, {
      role: "DRIVER",
      name: "OtherDriver",
      email: "other.isolation@test.local",
      password: "supersecret",
      vehicleName: "OtherCar",
      vehicleCapacity: 2,
    });
    const nusrat = await signup(app, {
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat.isolation@test.local",
      password: "supersecret",
    });

    await request(app)
      .patch("/api/driver/status")
      .set("Authorization", `Bearer ${jashim.token}`)
      .send({ status: "ONLINE", currentZoneId: zones.banani.id })
      .expect(200);
    const nusratReq = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${nusrat.token}`)
      .send({ pickupZoneId: zones.banani.id, destinationZoneId: zones.mohakhali.id })
      .expect(201);
    await request(app)
      .post(`/api/driver/requests/${nusratReq.body.id}/accept`)
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);

    // OtherDriver has no active pool at all -- these must 404, not reach
    // into Jashim's pool.
    await request(app)
      .post("/api/driver/pool/arrived")
      .set("Authorization", `Bearer ${otherDriver.token}`)
      .expect(404);
    await request(app)
      .post("/api/driver/pool/start")
      .set("Authorization", `Bearer ${otherDriver.token}`)
      .expect(404);
    await request(app)
      .post("/api/driver/pool/complete")
      .set("Authorization", `Bearer ${otherDriver.token}`)
      .expect(404);

    // Jashim's pool is untouched -- still exactly where he left it.
    const jashimState = await request(app)
      .get("/api/driver/dashboard")
      .set("Authorization", `Bearer ${jashim.token}`)
      .expect(200);
    expect(jashimState.body.pool.status).toBe("MATCHED_ACCEPTED");
  });
});

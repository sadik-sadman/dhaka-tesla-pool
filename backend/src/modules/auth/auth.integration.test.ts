import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../../app";
import { setPrismaClient } from "../../lib/prisma";
import { startTestDatabase, TestDatabase } from "../../test/db";

describe("auth integration (real Postgres-wire-protocol database)", () => {
  let testDb: TestDatabase;
  let prisma: PrismaClient;
  const app = createApp();

  beforeAll(async () => {
    testDb = await startTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: testDb.databaseUrl });
    setPrismaClient(prisma);
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await testDb.stop();
  }, 30000);

  it("signs up a passenger, then logs them in, then reads /me", async () => {
    const signupRes = await request(app).post("/api/auth/signup").send({
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat@dhakateslapool.test",
      password: "supersecret",
    });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user.email).toBe("nusrat@dhakateslapool.test");
    expect(signupRes.body.user.role).toBe("PASSENGER");
    expect(typeof signupRes.body.token).toBe("string");

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "nusrat@dhakateslapool.test",
      password: "supersecret",
    });
    expect(loginRes.status).toBe(200);

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${loginRes.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.name).toBe("Nusrat");
  });

  it("signs up a driver together with their vehicle in one transaction", async () => {
    const signupRes = await request(app).post("/api/auth/signup").send({
      role: "DRIVER",
      name: "Jashim",
      email: "jashim@dhakateslapool.test",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });

    expect(signupRes.status).toBe(201);

    const vehicle = await prisma.vehicle.findUnique({
      where: { driverId: signupRes.body.user.id },
    });
    expect(vehicle?.name).toBe("Bullet");
    expect(vehicle?.capacity).toBe(3);
  });

  it("rejects a duplicate email with 409, and a wrong password with 401", async () => {
    const dup = await request(app).post("/api/auth/signup").send({
      role: "PASSENGER",
      name: "Nusrat Again",
      email: "nusrat@dhakateslapool.test",
      password: "supersecret",
    });
    expect(dup.status).toBe(409);

    const wrongPassword = await request(app).post("/api/auth/login").send({
      email: "nusrat@dhakateslapool.test",
      password: "totally-wrong",
    });
    expect(wrongPassword.status).toBe(401);
  });

  it("two concurrent signups for the same email: one succeeds, the other gets a clean 409, never a 500", async () => {
    const body = {
      role: "PASSENGER" as const,
      name: "RaceCondition",
      email: "race@dhakateslapool.test",
      password: "supersecret",
    };

    const [first, second] = await Promise.all([
      request(app).post("/api/auth/signup").send(body),
      request(app).post("/api/auth/signup").send(body),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = first.status === 201 ? first : second;
    expect(typeof winner.body.token).toBe("string");

    const loser = first.status === 201 ? second : first;
    expect(loser.body.error).toBe("Email already registered");

    const users = await prisma.user.findMany({ where: { email: "race@dhakateslapool.test" } });
    expect(users).toHaveLength(1);
  });

  it("rejects /me with no token and with a garbage token", async () => {
    const noToken = await request(app).get("/api/auth/me");
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(badToken.status).toBe(401);
  });
});

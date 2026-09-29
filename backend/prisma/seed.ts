// Seed data uses the PRD's own story cast throughout (Section 18: keep the
// cast consistent) -- never generic user1/driver1 placeholders.
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo credentials for every seeded account -- fine for a seed/demo dataset,
// never used for anything beyond local/docker demo purposes.
const DEMO_PASSWORD = "TeslaPool123!";

// Predefined Dhaka zones (Section 4: no map API, just a fixed list + plain
// lat/lng). `corridor` is the invented pooling-compatibility group -- see
// docs/decisions.md#matching-rule.
const ZONES = [
  { name: "Banani", corridor: "gulshan_banani", lat: 23.7937, lng: 90.4066 },
  { name: "Gulshan 1", corridor: "gulshan_banani", lat: 23.7808, lng: 90.4142 },
  { name: "Gulshan 2", corridor: "gulshan_banani", lat: 23.7925, lng: 90.4078 },
  { name: "Mohakhali", corridor: "gulshan_banani", lat: 23.7806, lng: 90.4023 },
  { name: "Bashundhara", corridor: "gulshan_banani", lat: 23.8151, lng: 90.4256 },
  { name: "Dhanmondi", corridor: "central", lat: 23.7461, lng: 90.3742 },
  { name: "Farmgate", corridor: "central", lat: 23.7551, lng: 90.3897 },
  { name: "Mirpur", corridor: "north", lat: 23.8069, lng: 90.3687 },
  { name: "Uttara", corridor: "north", lat: 23.8759, lng: 90.3795 },
] as const;

async function main() {
  console.log("Seeding zones...");
  const zonesByName = new Map<string, string>();
  for (const zone of ZONES) {
    const row = await prisma.zone.upsert({
      where: { name: zone.name },
      update: { corridor: zone.corridor, lat: zone.lat, lng: zone.lng },
      create: zone,
    });
    zonesByName.set(zone.name, row.id);
  }

  console.log("Seeding story cast...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const jashim = await prisma.user.upsert({
    where: { email: "jashim@dhakateslapool.test" },
    update: {},
    create: {
      name: "Jashim",
      email: "jashim@dhakateslapool.test",
      passwordHash,
      role: Role.DRIVER,
    },
  });

  const nusrat = await prisma.user.upsert({
    where: { email: "nusrat@dhakateslapool.test" },
    update: {},
    create: {
      name: "Nusrat",
      email: "nusrat@dhakateslapool.test",
      passwordHash,
      role: Role.PASSENGER,
    },
  });

  const rafiq = await prisma.user.upsert({
    where: { email: "rafiq@dhakateslapool.test" },
    update: {},
    create: {
      name: "Rafiq",
      email: "rafiq@dhakateslapool.test",
      passwordHash,
      role: Role.PASSENGER,
    },
  });

  const shirin = await prisma.user.upsert({
    where: { email: "shirin@dhakateslapool.test" },
    update: {},
    create: {
      name: "Shirin",
      email: "shirin@dhakateslapool.test",
      passwordHash,
      role: Role.PASSENGER,
    },
  });

  console.log("Seeding Bullet (Jashim's Tesla)...");
  // update: {} -- once the vehicle exists, its runtime state (online/offline,
  // current zone) belongs to the app, not the seed script. This upsert used
  // to force status/currentZoneId back to ONLINE/Banani on every single run,
  // which silently discarded a driver's real online/offline toggle, a
  // manual zone change, or the auto-advance-on-completion behavior
  // (docs/decisions.md#driver-location) every time the backend restarted --
  // and the Docker image reseeds on every container start (Dockerfile CMD),
  // so any container restart under memory pressure reset live state anyone
  // was actively looking at.
  await prisma.vehicle.upsert({
    where: { driverId: jashim.id },
    update: {},
    create: {
      driverId: jashim.id,
      name: "Bullet",
      capacity: 3,
      status: "ONLINE",
      currentZoneId: zonesByName.get("Banani"),
    },
  });

  console.log("Seed complete:");
  console.log(`  Driver:     Jashim <${jashim.email}> / Bullet (3 seats, ONLINE at Banani)`);
  console.log(`  Passengers: Nusrat <${nusrat.email}>, Rafiq <${rafiq.email}>, Shirin <${shirin.email}>`);
  console.log(`  Demo password for all accounts: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

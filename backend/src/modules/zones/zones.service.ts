import { prisma } from "../../lib/prisma";

export async function listZones() {
  return prisma.zone.findMany({ orderBy: { name: "asc" } });
}

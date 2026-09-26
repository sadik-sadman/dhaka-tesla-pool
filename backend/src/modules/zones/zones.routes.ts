import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { listZones } from "./zones.service";

export const zonesRouter = Router();

zonesRouter.get("/", requireAuth, async (_req, res) => {
  const zones = await listZones();
  res.status(200).json(zones);
});

import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody, requireStringParam } from "../../middleware/validate";
import { serializeBigInt } from "../../lib/serialize";
import { createRideRequestSchema } from "./rides.schema";
import * as ridesService from "./rides.service";

export const ridesRouter = Router();

ridesRouter.post(
  "/",
  requireAuth,
  requireRole("PASSENGER"),
  validateBody(createRideRequestSchema),
  async (req, res) => {
    const rideRequest = await ridesService.createRideRequest(req.user!.sub, req.body);
    res.status(201).json(serializeBigInt(rideRequest));
  },
);

ridesRouter.get("/", requireAuth, requireRole("PASSENGER"), async (req, res) => {
  const rideRequests = await ridesService.listMyRideRequests(req.user!.sub);
  res.status(200).json(serializeBigInt(rideRequests));
});

ridesRouter.post(
  "/:id/cancel",
  requireAuth,
  requireRole("PASSENGER"),
  async (req, res) => {
    const rideRequest = await ridesService.cancelRideRequest(req.user!.sub, requireStringParam(req, "id"));
    res.status(200).json(serializeBigInt(rideRequest));
  },
);

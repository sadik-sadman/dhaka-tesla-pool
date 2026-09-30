import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validateBody, requireStringParam } from "../../middleware/validate";
import { serializeBigInt } from "../../lib/serialize";
import { setDriverStatusSchema } from "./driver.schema";
import * as driverService from "./driver.service";

export const driverRouter = Router();

driverRouter.use(requireAuth, requireRole("DRIVER"));

driverRouter.patch("/status", validateBody(setDriverStatusSchema), async (req, res) => {
  const vehicle = await driverService.setDriverStatus(req.user!.sub, req.body);
  res.status(200).json(vehicle);
});

driverRouter.get("/dashboard", async (req, res) => {
  const state = await driverService.getMyDashboardState(req.user!.sub);
  res.status(200).json(serializeBigInt(state));
});

driverRouter.get("/history", async (req, res) => {
  const history = await driverService.listMyHistory(req.user!.sub);
  res.status(200).json(serializeBigInt(history));
});

driverRouter.get("/requests", async (req, res) => {
  const requests = await driverService.listRelevantRequests(req.user!.sub);
  res.status(200).json(serializeBigInt(requests));
});

driverRouter.post("/requests/:id/accept", async (req, res) => {
  const rideRequest = await driverService.acceptRideRequest(req.user!.sub, requireStringParam(req, "id"));
  res.status(200).json(serializeBigInt(rideRequest));
});

driverRouter.post("/requests/:id/decline", async (req, res) => {
  const rideRequest = await driverService.declineRideRequest(req.user!.sub, requireStringParam(req, "id"));
  res.status(200).json(serializeBigInt(rideRequest));
});

driverRouter.post("/pool/arrived", async (req, res) => {
  const rideRequests = await driverService.markDriverArrived(req.user!.sub);
  res.status(200).json(serializeBigInt(rideRequests));
});

driverRouter.post("/pool/start", async (req, res) => {
  const rideRequests = await driverService.startTrip(req.user!.sub);
  res.status(200).json(serializeBigInt(rideRequests));
});

driverRouter.post("/pool/complete", async (req, res) => {
  const rideRequests = await driverService.completeTrip(req.user!.sub);
  res.status(200).json(serializeBigInt(rideRequests));
});

driverRouter.post("/pool/members/:id/remove", async (req, res) => {
  const rideRequest = await driverService.removePoolMember(req.user!.sub, requireStringParam(req, "id"));
  res.status(200).json(serializeBigInt(rideRequest));
});

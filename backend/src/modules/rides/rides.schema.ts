import { z } from "zod";

export const createRideRequestSchema = z.object({
  pickupZoneId: z.string().uuid(),
  destinationZoneId: z.string().uuid(),
  // Upper bound matches the vehicle-capacity bound in auth.schema.ts -- the
  // real per-vehicle limit is enforced where it actually matters, at accept
  // time (see driver.service.ts#acceptRideRequest), not here.
  seatsRequested: z.number().int().min(1).max(10).default(1),
  paymentMethod: z.enum(["CASH", "TESLAPAY"]).default("CASH"),
});

export type CreateRideRequestInput = z.infer<typeof createRideRequestSchema>;

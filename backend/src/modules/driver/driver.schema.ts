import { z } from "zod";

export const setDriverStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ONLINE"), currentZoneId: z.string().uuid() }),
  z.object({ status: z.literal("OFFLINE") }),
]);

export type SetDriverStatusInput = z.infer<typeof setDriverStatusSchema>;

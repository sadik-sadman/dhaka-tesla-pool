import { z } from "zod";

// A driver's vehicle is created together with their account (Section 17
// assumption -- see docs/decisions.md#one-vehicle-per-driver): there's no
// "driver with no Tesla yet" state to design around for the MVP.
export const signupSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("PASSENGER"),
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
  }),
  z.object({
    role: z.literal("DRIVER"),
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    vehicleName: z.string().min(1).max(50),
    vehicleCapacity: z.number().int().min(1).max(10),
  }),
]);

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

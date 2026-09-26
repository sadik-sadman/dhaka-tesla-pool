import { signupSchema, loginSchema } from "./auth.schema";

describe("signupSchema", () => {
  it("accepts a valid passenger signup", () => {
    const result = signupSchema.safeParse({
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat@example.com",
      password: "supersecret",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid driver signup with vehicle details", () => {
    const result = signupSchema.safeParse({
      role: "DRIVER",
      name: "Jashim",
      email: "jashim@example.com",
      password: "supersecret",
      vehicleName: "Bullet",
      vehicleCapacity: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a driver signup missing vehicle details", () => {
    const result = signupSchema.safeParse({
      role: "DRIVER",
      name: "Jashim",
      email: "jashim@example.com",
      password: "supersecret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = signupSchema.safeParse({
      role: "PASSENGER",
      name: "Nusrat",
      email: "nusrat@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({
      role: "PASSENGER",
      name: "Nusrat",
      email: "not-an-email",
      password: "supersecret",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts email + password", () => {
    const result = loginSchema.safeParse({ email: "nusrat@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = loginSchema.safeParse({ email: "nusrat@example.com" });
    expect(result.success).toBe(false);
  });
});

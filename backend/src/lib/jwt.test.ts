import { signAuthToken, verifyAuthToken } from "./jwt";

describe("jwt", () => {
  it("round-trips a signed payload", () => {
    const token = signAuthToken({ sub: "user-123", role: "PASSENGER" });
    const decoded = verifyAuthToken(token);

    expect(decoded.sub).toBe("user-123");
    expect(decoded.role).toBe("PASSENGER");
  });

  it("rejects a tampered token", () => {
    const token = signAuthToken({ sub: "user-123", role: "DRIVER" });
    const tampered = token.slice(0, -2) + "xx";

    expect(() => verifyAuthToken(tampered)).toThrow();
  });
});

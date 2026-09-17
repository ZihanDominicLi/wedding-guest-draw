import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://wedding:secret@localhost:5432/wedding",
  BETTER_AUTH_SECRET: "a-secure-auth-secret-that-is-32-chars",
  BETTER_AUTH_URL: "https://wedding.example.com",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "a-long-admin-password",
  WEDDING_DOMAIN: "wedding.example.com",
};

describe("parseEnv", () => {
  it("rejects a short auth secret", () => {
    expect(() =>
      parseEnv({ ...validEnv, BETTER_AUTH_SECRET: "short" }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("returns a validated environment", () => {
    expect(parseEnv(validEnv)).toEqual(validEnv);
  });
});

import { describe, expect, it } from "vitest";

import { hashAdminPassword, verifyAdminPassword } from "@/lib/password";

describe("administrator password hashing", () => {
  it("stores and verifies an Argon2id hash", async () => {
    const hash = await hashAdminPassword("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyAdminPassword({ hash, password: "correct horse battery staple" }),
    ).resolves.toBe(true);
    await expect(
      verifyAdminPassword({ hash, password: "wrong password" }),
    ).resolves.toBe(false);
  });
});

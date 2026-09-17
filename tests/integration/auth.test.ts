import { describe, expect, it } from "vitest";

import { auth } from "@/lib/auth";

describe("administrator authentication", () => {
  it("signs in the seeded administrator with Argon2 credentials", async () => {
    const response = await auth.api.signInEmail({
      body: {
        email: process.env.ADMIN_EMAIL!,
        password: process.env.ADMIN_PASSWORD!,
      },
      asResponse: true,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "wedding-draw.session_token",
    );
  });
});

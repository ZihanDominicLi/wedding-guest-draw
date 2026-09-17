import { describe, expect, it } from "vitest";

import { ok, problem } from "@/lib/http";

describe("JSON response helpers", () => {
  it("wraps successful data", async () => {
    const response = ok({ registered: true }, { status: 201 });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { registered: true },
    });
  });

  it("returns a stable problem payload", async () => {
    const response = problem(422, "INVALID_GUEST", "请检查登记信息", {
      field: "phoneLast4",
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_GUEST",
        message: "请检查登记信息",
        details: { field: "phoneLast4" },
      },
    });
  });
});

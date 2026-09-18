import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

describe("staff route proxy", () => {
  it("allows the secure production session cookie through to authentication", () => {
    const request = new NextRequest("https://wedding.example/admin", {
      headers: {
        cookie: "__Secure-wedding-draw.session_token=test-session",
      },
    });

    const response = proxy(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});

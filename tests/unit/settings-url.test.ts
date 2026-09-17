import { describe, expect, it } from "vitest";

import { canonicalJoinUrl } from "@/modules/settings/url";

describe("canonicalJoinUrl", () => {
  it("uses the configured application origin and normalizes its path", () => {
    expect(canonicalJoinUrl("https://wedding.example.com/admin/settings"))
      .toBe("https://wedding.example.com/join");
  });
});

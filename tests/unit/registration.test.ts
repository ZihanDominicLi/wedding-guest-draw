import { describe, expect, it } from "vitest";

import {
  normalizeGuestName,
  registrationSchema,
} from "@/modules/registration";

const validRegistration = {
  name: "张三",
  phoneLast4: "1234",
  relation: "GROOM_FRIEND" as const,
  childCount: 0,
  originProvince: "北京",
  originCity: "北京市",
};

describe("guest registration input", () => {
  it("normalizes display whitespace and full-width characters", () => {
    expect(normalizeGuestName("  张 三  ")).toBe("张三");
    expect(normalizeGuestName("Ａｌｉｃｅ")).toBe("Alice");
  });

  it("rejects phone suffixes that are not exactly four digits", () => {
    expect(
      registrationSchema.safeParse({
        ...validRegistration,
        phoneLast4: "12x4",
      }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        ...validRegistration,
        phoneLast4: "12345",
      }).success,
    ).toBe(false);
  });

  it("rejects child counts outside the supported range", () => {
    expect(
      registrationSchema.safeParse({
        ...validRegistration,
        childCount: -1,
      }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        ...validRegistration,
        childCount: 21,
      }).success,
    ).toBe(false);
  });
});

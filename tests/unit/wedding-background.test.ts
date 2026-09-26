import { describe, expect, it } from "vitest";

import { getWeddingBackgroundExtension } from "@/modules/settings/background";

describe("wedding screen backgrounds", () => {
  it("accepts the supplied 11 MB PNG that exceeded the old upload limit", () => {
    expect(getWeddingBackgroundExtension("image/png", 11_137_395)).toBe("png");
  });

  it("accepts files up to 25 MiB and rejects larger or unsupported files", () => {
    expect(getWeddingBackgroundExtension("image/jpeg", 25 * 1024 * 1024)).toBe("jpg");
    expect(getWeddingBackgroundExtension("image/webp", 25 * 1024 * 1024 + 1)).toBeNull();
    expect(getWeddingBackgroundExtension("image/svg+xml", 1024)).toBeNull();
  });
});

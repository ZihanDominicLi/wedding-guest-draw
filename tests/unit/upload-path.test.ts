import { describe, expect, it } from "vitest";

import { resolveUploadedAsset } from "@/modules/uploads/path";

describe("uploaded asset paths", () => {
  it("resolves only generated image filenames inside the upload directory", () => {
    expect(resolveUploadedAsset("/data/uploads", "prize-123.webp")).toBe("/data/uploads/prize-123.webp");
    expect(resolveUploadedAsset("/data/uploads", "wedding-background-abc.jpg")).toBe("/data/uploads/wedding-background-abc.jpg");
  });

  it("rejects traversal and unsupported extensions", () => {
    expect(() => resolveUploadedAsset("/data/uploads", "../secret.env")).toThrow(/filename/i);
    expect(() => resolveUploadedAsset("/data/uploads", "malware.svg")).toThrow(/filename/i);
  });
});

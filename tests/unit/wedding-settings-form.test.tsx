// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../next.config";
import { WeddingSettingsForm } from "@/components/admin/WeddingSettingsForm";

const initialValue = {
  groomName: "新郎",
  brideName: "新娘",
  weddingDate: "",
  venueProvince: "",
  venueCity: "",
  registrationOpen: true,
  formalDrawMode: false,
  screenTitle: "我们的婚礼",
  screenBackgroundPath: null,
};

const fetchMock = vi.fn();

function bytes(value: string | number | undefined) {
  if (typeof value === "number") return value;
  const match = value?.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/i);
  if (!match) return 0;
  const factors = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * factors[match[2].toLowerCase() as keyof typeof factors];
}

describe("wedding settings background save", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("buffers the full supported background image and multipart overhead in Next proxy", () => {
    const limit = nextConfig.experimental?.proxyClientMaxBodySize;

    expect(bytes(limit)).toBeGreaterThan(26 * 1024 * 1024);
  });

  it("shows an error and re-enables save after the settings request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<WeddingSettingsForm initialValue={initialValue} />);

    const form = screen.getByRole("button", { name: "保存设置" }).closest("form");
    fireEvent.submit(form!);

    const status = await screen.findByRole("status");
    const saveButton = screen.getByRole("button", { name: "保存设置" });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    expect(status.textContent).toContain("保存失败");
  });

  it("shows the HTTP status and re-enables save when the server returns a non-JSON error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 413,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });
    render(<WeddingSettingsForm initialValue={initialValue} />);

    const form = screen.getByRole("button", { name: "保存设置" }).closest("form");
    fireEvent.submit(form!);

    const status = await screen.findByRole("status");
    const saveButton = screen.getByRole("button", { name: "保存设置" });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    expect(status.textContent).toContain("413");
  });
});

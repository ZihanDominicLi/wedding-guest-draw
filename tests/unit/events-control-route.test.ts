import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, scheduleTransition } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  scheduleTransition: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/modules/quiz/transition", () => ({ scheduleTransition }));

import { POST } from "@/app/api/events/[id]/control/route";

describe("event control route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: "admin-1", name: "Host", email: "host@example.com" });
    scheduleTransition.mockResolvedValue({ eventId: "event-1", phase: "REGISTRATION", version: 1 });
  });

  it("schedules a version-checked action for the authenticated administrator", async () => {
    const response = await POST(new Request("https://wedding.example.com/api/events/event-1/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://wedding.example.com",
        Host: "wedding.example.com",
      },
      body: JSON.stringify({ action: "START", expectedVersion: 4, requestId: "request-1" }),
    }), { params: Promise.resolve({ id: "event-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(scheduleTransition).toHaveBeenCalledWith({
      eventId: "event-1",
      action: "START",
      expectedVersion: 4,
      requestId: "request-1",
      actorId: "admin-1",
    });
  });

  it("rejects cross-origin control requests", async () => {
    const response = await POST(new Request("https://wedding.example.com/api/events/event-1/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example.net",
        Host: "wedding.example.com",
      },
      body: JSON.stringify({ action: "START", expectedVersion: 4, requestId: "request-1" }),
    }), { params: Promise.resolve({ id: "event-1" }) });

    expect(response.status).toBe(403);
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(scheduleTransition).not.toHaveBeenCalled();
  });
});

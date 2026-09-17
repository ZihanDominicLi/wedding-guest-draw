import { describe, expect, it } from "vitest";

import { createLiveEventBus } from "@/modules/live/bus";

describe("live event bus", () => {
  it("assigns monotonic event ids and replays newer events", () => {
    const bus = createLiveEventBus({ capacity: 3 });
    const first = bus.publish({ type: "guest.changed", scope: "admin", payload: { total: 1 } });
    const second = bus.publish({ type: "grouping.changed", scope: "admin", payload: { total: 2 } });

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(bus.replay("admin", 1)).toMatchObject({ mode: "replay", events: [second] });
  });

  it("requests a snapshot when the requested event fell out of bounded history", () => {
    const bus = createLiveEventBus({ capacity: 2 });
    bus.publish({ type: "guest.changed", scope: "admin", payload: { total: 1 } });
    bus.publish({ type: "guest.changed", scope: "admin", payload: { total: 2 } });
    bus.publish({ type: "guest.changed", scope: "admin", payload: { total: 3 } });

    expect(bus.replay("admin", 0)).toEqual({ mode: "snapshot-required", events: [] });
  });

  it("rejects sensitive screen event payloads", () => {
    const bus = createLiveEventBus();

    expect(() =>
      bus.publish({
        type: "round.changed",
        scope: "screen",
        payload: { winnerName: "林嘉", phoneLast4: "8080" },
      }),
    ).toThrow(/sensitive/i);
  });
});

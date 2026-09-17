import type { LiveEvent, LiveScope, NewLiveEvent } from "./protocol";

const SCREEN_FORBIDDEN_KEYS = new Set([
  "phoneLast4",
  "phone",
  "childCount",
  "originProvince",
  "originCity",
  "deviceHash",
]);

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) => SCREEN_FORBIDDEN_KEYS.has(key) || containsSensitiveKey(nested),
  );
}

export function createLiveEventBus({ capacity = 500 } = {}) {
  let nextId = 1;
  const history: LiveEvent[] = [];
  const listeners = new Set<(event: LiveEvent) => void>();

  function publish(input: NewLiveEvent): LiveEvent {
    if (input.scope === "screen" && containsSensitiveKey(input.payload)) {
      throw new Error("Sensitive fields are forbidden in screen events");
    }
    const event: LiveEvent = {
      ...input,
      id: nextId++,
      createdAt: new Date().toISOString(),
    };
    history.push(event);
    if (history.length > capacity) history.splice(0, history.length - capacity);
    listeners.forEach((listener) => listener(event));
    return event;
  }

  function replay(scope: LiveScope, lastEventId: number) {
    if (history.length && lastEventId < history[0].id - 1) {
      return { mode: "snapshot-required" as const, events: [] };
    }
    return {
      mode: "replay" as const,
      events: history.filter(
        (event) => event.id > lastEventId && event.scope === scope,
      ),
    };
  }

  function subscribe(listener: (event: LiveEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { publish, replay, subscribe };
}

const globalLive = globalThis as unknown as {
  weddingLiveBus?: ReturnType<typeof createLiveEventBus>;
};

export const liveEventBus =
  globalLive.weddingLiveBus ?? createLiveEventBus({ capacity: 500 });
globalLive.weddingLiveBus = liveEventBus;

export const publishLiveEvent = liveEventBus.publish;
export const subscribeLiveEvents = liveEventBus.subscribe;

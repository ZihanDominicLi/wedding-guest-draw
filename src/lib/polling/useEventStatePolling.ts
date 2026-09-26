"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PollingState = object;

type VersionedState = { version?: number };

const MAX_FAILURE_DELAY_MS = 30_000;

export function getPollingDelay(intervalMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return intervalMs;
  return Math.min(MAX_FAILURE_DELAY_MS, intervalMs * (2 ** Math.min(consecutiveFailures, 8)));
}

export function applyVersionedState<T extends PollingState>(previous: T | null, next: T): T {
  const previousVersion = (previous as VersionedState | null)?.version;
  const nextVersion = (next as VersionedState).version;
  if (previous && previousVersion !== undefined && nextVersion !== undefined && nextVersion < previousVersion) return previous;
  return next;
}

type PollingOptions<T extends PollingState> = {
  url?: string;
  eventId?: string;
  actor?: "admin" | "participant" | "public";
  initialState?: T | null;
  intervalMs?: number;
  onState?: (state: T) => void;
};

export function useEventStatePolling<T extends PollingState>({
  url: explicitUrl,
  eventId,
  actor: _actor,
  initialState = null,
  intervalMs = 5_000,
  onState,
}: PollingOptions<T>) {
  void _actor;
  const url = explicitUrl ?? (eventId ? `/api/events/${encodeURIComponent(eventId)}/state` : null);
  const [state, setState] = useState<T | null>(initialState);
  const [loading, setLoading] = useState(initialState === null);
  const [error, setError] = useState<Error | null>(null);
  const requestInFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const failuresRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!url || requestInFlight.current) return false;
    requestInFlight.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Polling request failed (${response.status})`);
      const payload = await response.json() as { data?: T };
      if (!payload.data) throw new Error("Polling response did not contain data");
      setState((previous) => {
        const next = applyVersionedState(previous, payload.data!);
        onState?.(next);
        return next;
      });
      setError(null);
      setLoading(false);
      failuresRef.current = 0;
      return true;
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause : new Error("Polling request failed"));
        setLoading(false);
        failuresRef.current += 1;
      }
      return false;
    } finally {
      requestInFlight.current = false;
    }
  }, [onState, url]);

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      const succeeded = await refresh();
      if (disposed) return;
      timer = window.setTimeout(() => void poll(), getPollingDelay(intervalMs, succeeded ? 0 : failuresRef.current));
    };
    const trigger = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      void poll();
    };
    const onOnline = () => trigger();
    const onVisible = () => { if (document.visibilityState === "visible") trigger(); };
    const initialTimer = window.setTimeout(() => void poll(), 0);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.clearTimeout(initialTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
  }, [intervalMs, refresh, url]);

  return { state, loading, error, retryNow: refresh };
}

"use client";

import { useEffect, useRef, useState } from "react";

export function QuizTimer({ closesAt }: { closesAt: string | null }) {
  const clockOrigin = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const origin = Date.now() - (typeof performance === "undefined" ? 0 : performance.now());
    clockOrigin.current = origin;
    const monotonicNow = () => (typeof performance === "undefined" ? Date.now() : origin + performance.now());
    const update = () => setRemaining(closesAt ? Math.max(0, new Date(closesAt).getTime() - monotonicNow()) : 0);
    update();
    const timer = window.setInterval(update, 250);
    return () => {
      window.clearInterval(timer);
      clockOrigin.current = null;
    };
  }, [closesAt]);
  return <strong aria-label="本题剩余时间">{Math.ceil(remaining / 1000)}s</strong>;
}

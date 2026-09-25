"use client";

import { useEffect, useState } from "react";

export function QuizTimer({ closesAt }: { closesAt: string | null }) {
  const [remaining, setRemaining] = useState(() => closesAt ? Math.max(0, new Date(closesAt).getTime() - Date.now()) : 0);
  useEffect(() => {
    const update = () => setRemaining(closesAt ? Math.max(0, new Date(closesAt).getTime() - Date.now()) : 0);
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [closesAt]);
  return <strong aria-label="本题剩余时间">{Math.ceil(remaining / 1000)}s</strong>;
}

// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuizTimer } from "@/components/quiz/QuizTimer";

describe("QuizTimer", () => {
  it("uses a monotonic clock even when the system clock jumps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T00:00:00.000Z"));

    const view = render(<QuizTimer closesAt="2026-09-27T00:00:30.000Z" />);
    expect(view.getByRole("strong", { name: "本题剩余时间" }).textContent).toBe("30s");

    vi.setSystemTime(new Date("2026-09-27T00:00:10.000Z"));
    vi.advanceTimersByTime(250);
    expect(view.getByRole("strong", { name: "本题剩余时间" }).textContent).toBe("30s");
    vi.useRealTimers();
  });
});

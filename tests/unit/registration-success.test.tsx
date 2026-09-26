// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { RegistrationSuccess } from "@/components/join/RegistrationSuccess";

describe("registration success handoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replace.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the quiz automatically after showing the registration confirmation", async () => {
    render(
      <RegistrationSuccess
        result={{
          attendanceNumber: 12,
          primaryGroup: { key: "friends", name: "朋友组" },
          created: true,
          quizAccess: { available: true },
        }}
      />,
    );

    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1800);
    });

    expect(replace).toHaveBeenCalledWith("/quiz");
  });
});

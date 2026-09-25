import { describe, expect, it } from "vitest";

import { buildEmergencyCsv } from "@/modules/backup/emergency-export";
import { buildGuestCsv } from "@/modules/guests/export";

describe("quiz export redaction", () => {
  it("includes quiz reporting fields in the staff CSV", () => {
    const csv = buildGuestCsv([{ attendanceNumber: 1, name: "宾客", relation: "FRIEND", childCount: 0, originProvince: "广东", originCity: "深圳", enabled: true, quizScore: 8, quizCompletedAt: new Date("2026-09-25T10:00:00Z"), quizSessionId: "session-1", primaryGroup: { name: "朋友" }, tags: [], createdAt: new Date("2026-09-25T09:00:00Z"), updatedAt: new Date("2026-09-25T10:00:00Z") }]);
    expect(csv).toContain("答题分数");
    expect(csv).toContain("8");
    expect(csv).not.toContain("tokenHash");
    expect(csv).not.toContain("correctOption");
  });

  it("keeps emergency export free of quiz secrets", () => {
    const csv = buildEmergencyCsv([{ id: "g1", name: "宾客", primaryGroup: { name: "朋友" }, enabled: true, winners: [], phoneLast4: "1234", childCount: 1, originCity: "深圳", quizScore: 10, quizSessionId: "s1" }]);
    expect(csv).not.toContain("1234");
    expect(csv).not.toContain("s1");
    expect(csv).not.toContain("correctOption");
  });
});

import { describe, expect, it } from "vitest";

import { redactAuditPayload } from "@/modules/audit/redact";
import { buildEmergencyCsv } from "@/modules/backup/emergency-export";

describe("audit and emergency export redaction", () => {
  it("removes sensitive values recursively without changing the source", () => {
    const input = {
      name: "周青",
      phoneLast4: "7788",
      nested: { deviceHash: "secret-device", originCity: "深圳", status: "enabled" },
      rows: [{ password: "secret", group: "共同好友组" }],
    };

    expect(redactAuditPayload(input)).toEqual({
      name: "周青",
      nested: { status: "enabled" },
      rows: [{ group: "共同好友组" }],
    });
    expect(input.phoneLast4).toBe("7788");
  });

  it("exports only recovery fields with a UTF-8 BOM", () => {
    const csv = buildEmergencyCsv([
      { id: "guest-1", name: "周青", primaryGroup: { name: "共同好友组" }, enabled: true, winners: [{ status: "PUBLISHED" }], phoneLast4: "7788", childCount: 2, originCity: "深圳" },
    ]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("宾客ID,姓名,主组,可参与抽奖,中奖状态");
    expect(csv).toContain("guest-1,周青,共同好友组,否,PUBLISHED");
    expect(csv).not.toContain("7788");
    expect(csv).not.toContain("深圳");
  });
});

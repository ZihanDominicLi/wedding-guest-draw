import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { appendAudit } from "@/modules/audit/service";
import { hasFreshBackup } from "@/modules/backup/service";
import { getHealth } from "@/modules/health/service";

const marker = "operations-test";

describe("operational services", () => {
  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { entityId: marker } });
    await db.backupRecord.deleteMany({ where: { path: { startsWith: marker } } });
  });

  it("reports healthy only after a database query succeeds", async () => {
    await expect(getHealth()).resolves.toMatchObject({ status: "ok", database: "healthy" });
  });

  it("redacts sensitive fields before writing an audit event", async () => {
    await appendAudit({ action: "test.redaction", entityType: "Test", entityId: marker, after: { name: "周青", phoneLast4: "7788", nested: { originCity: "深圳", enabled: true } } });
    const event = await db.auditEvent.findFirstOrThrow({ where: { entityId: marker } });
    expect(event.afterJson).toEqual({ name: "周青", nested: { enabled: true } });
  });

  it("recognizes only backups newer than the requested age", async () => {
    expect(await hasFreshBackup(30)).toBe(false);
    await db.backupRecord.create({ data: { path: `${marker}-old`, checksum: "old", uploadsJson: [], createdAt: new Date(Date.now() - 31 * 60 * 1000) } });
    expect(await hasFreshBackup(30)).toBe(false);
    await db.backupRecord.create({ data: { path: `${marker}-fresh`, checksum: "fresh", uploadsJson: [] } });
    expect(await hasFreshBackup(30)).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  cancelRound,
  BackupRequiredError,
  createRound,
  drawRound,
  DrawingStateError,
  lockRound,
  publishRound,
  revokeWinner,
} from "@/modules/drawing/service";
import { getScreenSnapshot } from "@/modules/live/snapshot";

const prefix = "draw-test-";
let actorId: string;
let groupId: string;
let prizeId: string;

async function cleanup() {
  await db.weddingSettings.update({ where: { id: "default" }, data: { formalDrawMode: false } });
  await db.backupRecord.deleteMany({ where: { path: { startsWith: `${prefix}backup` } } });
  const rounds = await db.drawRound.findMany({
    where: { targetGroup: { key: { startsWith: prefix } } },
    select: { id: true },
  });
  const roundIds = rounds.map((round) => round.id);
  await db.winner.deleteMany({ where: { roundId: { in: roundIds } } });
  await db.drawCandidateSnapshot.deleteMany({ where: { roundId: { in: roundIds } } });
  await db.auditEvent.deleteMany({ where: { entityType: { in: ["DrawRound", "Winner"] }, entityId: { in: roundIds } } });
  await db.drawRound.deleteMany({ where: { id: { in: roundIds } } });
  await db.prizeGroup.deleteMany({ where: { group: { key: { startsWith: prefix } } } });
  await db.prize.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.guest.deleteMany({ where: { normalizedName: { startsWith: prefix } } });
  await db.group.deleteMany({ where: { key: { startsWith: prefix } } });
  await db.idempotencyRecord.deleteMany({ where: { scope: { startsWith: "draw:" } } });
}

async function createGuest(suffix: string, enabled = true, assignedGroupId: string | null = groupId) {
  return db.guest.create({
    data: {
      name: `${prefix}${suffix}`,
      normalizedName: `${prefix}${suffix}`,
      phoneLast4: suffix.padStart(4, "0").slice(-4),
      relation: "MUTUAL_FRIEND",
      childCount: 0,
      originProvince: "北京",
      originCity: "北京市",
      isOutOfTown: false,
      enabled,
      primaryGroupId: assignedGroupId,
    },
  });
}

describe("drawing service", () => {
  beforeEach(async () => {
    await cleanup();
    actorId = (await db.adminUser.findUniqueOrThrow({ where: { email: process.env.ADMIN_EMAIL! } })).id;
    const group = await db.group.create({ data: { key: `${prefix}group`, name: "测试组", color: "#48614b", sortOrder: 99 } });
    groupId = group.id;
    const prize = await db.prize.create({ data: { name: `${prefix}prize`, plannedWinnerCount: 2, sortOrder: 99, allowedGroups: { create: { groupId } } } });
    prizeId = prize.id;
  });
  afterEach(cleanup);

  it("freezes only eligible candidates and completes the persisted state machine", async () => {
    const first = await createGuest("101");
    const second = await createGuest("102");
    await createGuest("103", false);
    await createGuest("104", true, null);

    const oldRound = await db.drawRound.create({ data: { prizeId, targetGroupId: groupId, plannedWinnerCount: 1, status: "DRAWN" } });
    await db.winner.create({ data: { roundId: oldRound.id, guestId: second.id, prizeId, status: "RESERVED" } });

    const created = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, "create-one");
    expect(created.status).toBe("PREPARING");
    const locked = await lockRound(created.id, created.version, actorId, "lock-one");
    expect(locked).toMatchObject({ status: "LOCKED", version: 2, candidateCount: 1 });

    await db.guest.update({ where: { id: first.id }, data: { name: "抽签后改名", enabled: false } });
    const snapshot = await db.drawCandidateSnapshot.findFirstOrThrow({ where: { roundId: created.id } });
    expect(snapshot).toMatchObject({ guestId: first.id, displayName: `${prefix}101` });

    const drawn = await drawRound(created.id, locked.version, actorId, "draw-one", () => 0);
    expect(drawn).toMatchObject({ status: "DRAWN", version: 3 });
    expect(drawn.winners).toEqual([expect.objectContaining({ guestId: first.id, status: "RESERVED" })]);
    await expect(getScreenSnapshot()).resolves.toMatchObject({
      round: { id: created.id, winners: [{ name: `${prefix}101` }] },
    });

    const published = await publishRound(created.id, drawn.version, actorId, "publish-one");
    expect(published).toMatchObject({ status: "PUBLISHED", version: 4 });
    await expect(db.winner.findFirstOrThrow({ where: { roundId: created.id } })).resolves.toMatchObject({ status: "PUBLISHED" });
    await expect(db.auditEvent.count({ where: { entityType: "DrawRound", entityId: created.id } })).resolves.toBeGreaterThanOrEqual(4);
  });

  it("rejects stale versions and releases a reservation when a drawn round is cancelled", async () => {
    await createGuest("201");
    const created = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, "create-two");
    const locked = await lockRound(created.id, created.version, actorId, "lock-two");

    await expect(lockRound(created.id, created.version, actorId, "stale-lock")).rejects.toBeInstanceOf(DrawingStateError);
    const drawn = await drawRound(created.id, locked.version, actorId, "draw-two", () => 0);
    const cancelled = await cancelRound(created.id, drawn.version, actorId, "流程演练取消", "cancel-two");
    expect(cancelled.status).toBe("CANCELLED");
    await expect(db.winner.findFirstOrThrow({ where: { roundId: created.id } })).resolves.toMatchObject({ status: "REVOKED", revokeReason: "流程演练取消" });
  });

  it("revokes a published winner so the guest can enter a later round", async () => {
    const guest = await createGuest("301");
    const created = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, "create-three");
    const locked = await lockRound(created.id, created.version, actorId, "lock-three");
    const drawn = await drawRound(created.id, locked.version, actorId, "draw-three", () => 0);
    const published = await publishRound(created.id, drawn.version, actorId, "publish-three");
    const revoked = await revokeWinner(published.winners[0].id, actorId, "宾客主动放弃", "revoke-three");

    expect(revoked).toMatchObject({ status: "REVOKED", revokeReason: "宾客主动放弃" });
    const next = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, "create-four");
    await expect(lockRound(next.id, next.version, actorId, "lock-four")).resolves.toMatchObject({ candidateCount: 1 });
    expect(guest.id).toBeTruthy();
  });

  it("requires a fresh backup before locking a formal draw", async () => {
    await createGuest("401");
    await db.weddingSettings.update({ where: { id: "default" }, data: { formalDrawMode: true } });
    const created = await createRound({ prizeId, targetGroupId: groupId, winnerCount: 1 }, actorId, "create-formal");

    await expect(lockRound(created.id, created.version, actorId, "lock-formal-missing")).rejects.toBeInstanceOf(BackupRequiredError);
    await db.backupRecord.create({ data: { path: `${prefix}backup-fresh`, checksum: "test", uploadsJson: [] } });
    await expect(lockRound(created.id, created.version, actorId, "lock-formal-ready")).resolves.toMatchObject({ status: "LOCKED" });
  });
});

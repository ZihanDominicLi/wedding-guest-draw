import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DrawConsole } from "@/components/draw/DrawConsole";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { eligibleGuestWhere } from "@/modules/drawing/eligibility";

export const dynamic = "force-dynamic";

export default async function DrawPage() {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const [prizes, groups, presence] = await Promise.all([
    db.prize.findMany({ where: { enabled: true }, include: { allowedGroups: true }, orderBy: { sortOrder: "asc" } }),
    db.group.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.auditEvent.findFirst({ where: { action: "screen.presence" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const groupRows = await Promise.all(groups.map(async (group) => ({ ...group, eligibleCount: await db.guest.count({ where: eligibleGuestWhere(group.id) }) })));
  const screenConnected = Boolean(presence);
  return <DrawConsole prizes={prizes.map((prize) => ({ id: prize.id, name: prize.name, imagePath: prize.imagePath, plannedWinnerCount: prize.plannedWinnerCount, groupIds: prize.allowedGroups.map((item) => item.groupId) }))} groups={groupRows} screenConnected={screenConnected} />;
}

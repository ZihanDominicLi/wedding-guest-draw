import { db } from "@/lib/db";

export async function getAdminSnapshot() {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [totalGuests, childStats, outOfTown, exceptions, groups, recent, screenPresence] =
    await Promise.all([
      db.guest.count({ where: { enabled: true } }),
      db.guest.aggregate({ where: { enabled: true }, _sum: { childCount: true } }),
      db.guest.count({ where: { enabled: true, isOutOfTown: true } }),
      db.guest.count({ where: { enabled: true, primaryGroupId: null } }),
      db.group.findMany({
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, key: true, name: true, color: true, _count: { select: { guests: { where: { enabled: true } } } } },
      }),
      db.guest.findMany({ where: { checkedInAt: { gte: since } }, select: { checkedInAt: true }, orderBy: { checkedInAt: "asc" } }),
      db.auditEvent.findFirst({ where: { action: "screen.presence" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
  const trend = new Map<string, number>();
  for (const guest of recent) {
    const date = guest.checkedInAt;
    date.setSeconds(0, 0);
    const key = date.toISOString();
    trend.set(key, (trend.get(key) ?? 0) + 1);
  }
  return {
    totalGuests,
    childCount: childStats._sum.childCount ?? 0,
    outOfTown,
    exceptions,
    groups: groups.map((group) => ({ ...group, count: group._count.guests })),
    trend: [...trend].map(([minute, count]) => ({ minute, count })),
    database: "healthy" as const,
    screenLastSeenAt: screenPresence?.createdAt.toISOString() ?? null,
  };
}

export async function getScreenSnapshot() {
  const round = await db.drawRound.findFirst({
    where: { status: { in: ["LOCKED", "DRAWN", "PUBLISHED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      prize: { select: { name: true, imagePath: true } },
      targetGroup: { select: { name: true } },
      winners: {
        where: { status: { in: ["RESERVED", "PUBLISHED"] } },
        select: { id: true, status: true, guest: { select: { name: true } } },
      },
      snapshots: { select: { displayName: true } },
    },
  });
  const settings = await db.weddingSettings.findUniqueOrThrow({ where: { id: "default" } });
  return {
    settings: { screenTitle: settings.screenTitle, screenBackgroundPath: settings.screenBackgroundPath },
    round: round
      ? {
          id: round.id,
          status: round.status,
          version: round.version,
          prizeName: round.prize.name,
          prizeImagePath: round.prize.imagePath,
          groupName: round.targetGroup.name,
          candidates: round.snapshots.map((item) => item.displayName),
          winners: round.winners.map((winner) => ({ id: winner.id, name: winner.guest.name, status: winner.status })),
        }
      : null,
  };
}

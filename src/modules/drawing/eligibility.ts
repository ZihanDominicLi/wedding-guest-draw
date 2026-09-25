import type { Prisma } from "@prisma/client";

export function eligibleGuestWhere(groupId: string, scoreThreshold?: number | null): Prisma.GuestWhereInput {
  return {
    enabled: true,
    primaryGroupId: groupId,
    winners: { none: { status: { in: ["RESERVED", "PUBLISHED"] } } },
    ...(scoreThreshold === undefined || scoreThreshold === null
      ? {}
      : { quizCompletedAt: { not: null }, quizScore: { gte: scoreThreshold } }),
  };
}

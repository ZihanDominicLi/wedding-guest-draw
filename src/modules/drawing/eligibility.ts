import type { Prisma } from "@prisma/client";

export function eligibleGuestWhere(groupId: string): Prisma.GuestWhereInput {
  return {
    enabled: true,
    primaryGroupId: groupId,
    winners: { none: { status: { in: ["RESERVED", "PUBLISHED"] } } },
  };
}

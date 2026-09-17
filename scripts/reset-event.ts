import { db } from "../src/lib/db";

const CONFIRMATION = "RESET_TEST_EVENT";

async function main() {
  if (!process.argv.includes(CONFIRMATION)) {
    throw new Error(`Refusing to reset. Run: pnpm event:reset --confirm ${CONFIRMATION}`);
  }

  const guests = await db.guest.findMany({ where: { normalizedName: { startsWith: "演示宾客" } }, select: { id: true } });
  const guestIds = guests.map((guest) => guest.id);
  const rounds = await db.drawRound.findMany({ where: { OR: [{ prizeId: "demo-prize" }, { snapshots: { some: { guestId: { in: guestIds } } } }] }, select: { id: true } });
  const roundIds = rounds.map((round) => round.id);
  const winners = await db.winner.findMany({ where: { roundId: { in: roundIds } }, select: { id: true } });
  const winnerIds = winners.map((winner) => winner.id);

  await db.$transaction(async (transaction) => {
    await transaction.auditEvent.deleteMany({ where: { OR: [{ entityType: "DrawRound", entityId: { in: roundIds } }, { entityType: "Winner", entityId: { in: winnerIds } }, { entityType: "Guest", entityId: { in: guestIds } }] } });
    await transaction.winner.deleteMany({ where: { roundId: { in: roundIds } } });
    await transaction.drawCandidateSnapshot.deleteMany({ where: { roundId: { in: roundIds } } });
    await transaction.drawRound.deleteMany({ where: { id: { in: roundIds } } });
    await transaction.guestTag.deleteMany({ where: { guestId: { in: guestIds } } });
    await transaction.guest.deleteMany({ where: { id: { in: guestIds } } });
    await transaction.prizeGroup.deleteMany({ where: { prizeId: "demo-prize" } });
    await transaction.prize.deleteMany({ where: { id: "demo-prize" } });
  });
  console.log(`Removed ${guestIds.length} demo guests and ${roundIds.length} demo rounds. Settings and administrators were preserved.`);
}

main().finally(() => db.$disconnect());

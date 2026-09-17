import { db } from "../src/lib/db";

const DEMO_PREFIX = "演示宾客";

const groupKeys = [
  "family-with-children",
  "out-of-town",
  "groom-guests",
  "bride-guests",
  "mutual-friends",
  "other-guests",
] as const;

const relations = [
  "GROOM_RELATIVE",
  "BRIDE_RELATIVE",
  "GROOM_FRIEND",
  "BRIDE_FRIEND",
  "MUTUAL_FRIEND",
  "OTHER",
] as const;

async function main() {
  const groups = await db.group.findMany({ where: { key: { in: [...groupKeys] } } });
  const groupByKey = new Map(groups.map((group) => [group.key, group.id]));
  if (groups.length !== groupKeys.length) throw new Error("Run pnpm seed before seed:demo");

  for (let index = 1; index <= 100; index += 1) {
    const groupIndex = (index - 1) % groupKeys.length;
    const groupKey = groupKeys[groupIndex];
    const name = `${DEMO_PREFIX}${String(index).padStart(3, "0")}`;
    await db.guest.upsert({
      where: {
        normalizedName_phoneLast4_collisionDiscriminator: {
          normalizedName: name,
          phoneLast4: String(index).padStart(4, "0"),
          collisionDiscriminator: 0,
        },
      },
      update: { enabled: true, primaryGroupId: groupByKey.get(groupKey) },
      create: {
        name,
        normalizedName: name,
        phoneLast4: String(index).padStart(4, "0"),
        relation: relations[groupIndex],
        childCount: groupKey === "family-with-children" ? 1 + (index % 2) : 0,
        originProvince: groupKey === "out-of-town" ? "广东" : "北京",
        originCity: groupKey === "out-of-town" ? "深圳市" : "北京市",
        isOutOfTown: groupKey === "out-of-town",
        primaryGroupId: groupByKey.get(groupKey),
      },
    });
  }

  const prize = await db.prize.upsert({
    where: { id: "demo-prize" },
    update: { name: "演示纪念礼", enabled: true },
    create: { id: "demo-prize", name: "演示纪念礼", plannedWinnerCount: 3, sortOrder: 999 },
  });
  await db.prizeGroup.deleteMany({ where: { prizeId: prize.id } });
  await db.prizeGroup.createMany({ data: groups.map((group) => ({ prizeId: prize.id, groupId: group.id })) });
  console.log("Created 100 deterministic demo guests and one demo prize.");
}

main().finally(() => db.$disconnect());

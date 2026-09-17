import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { hashAdminPassword } from "../src/lib/password";

const groups = [
  { key: "family-with-children", name: "亲子宾客组", color: "#9e5a3c", sortOrder: 1 },
  { key: "out-of-town", name: "远道宾客组", color: "#496779", sortOrder: 2 },
  { key: "groom-guests", name: "男方亲友组", color: "#4f6551", sortOrder: 3 },
  { key: "bride-guests", name: "女方亲友组", color: "#9e4b55", sortOrder: 4 },
  { key: "mutual-friends", name: "共同好友组", color: "#6b5b78", sortOrder: 5 },
  { key: "other-guests", name: "其他宾客组", color: "#6d6d65", sortOrder: 6 },
] as const;

const tags = [
  { key: "with-children", name: "带小朋友", color: "#9e5a3c" },
  { key: "out-of-town", name: "外地宾客", color: "#496779" },
  { key: "groom-side", name: "男方亲友", color: "#4f6551" },
  { key: "bride-side", name: "女方亲友", color: "#9e4b55" },
  { key: "colleague", name: "同事", color: "#5f6e78" },
  { key: "classmate", name: "同学", color: "#6b5b78" },
] as const;

async function seedAdmin() {
  const email = env.ADMIN_EMAIL.toLowerCase();
  const password = await hashAdminPassword(env.ADMIN_PASSWORD);
  const user = await db.adminUser.upsert({
    where: { email },
    update: { name: "现场管理员", emailVerified: true },
    create: {
      id: randomUUID(),
      name: "现场管理员",
      email,
      emailVerified: true,
    },
  });

  await db.account.upsert({
    where: { id: `credential:${user.id}` },
    update: { password },
    create: {
      id: `credential:${user.id}`,
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password,
    },
  });
}

async function seedGroupsAndRules() {
  const storedGroups = new Map<string, string>();
  const storedTags = new Map<string, string>();

  for (const group of groups) {
    const stored = await db.group.upsert({
      where: { key: group.key },
      update: group,
      create: group,
    });
    storedGroups.set(group.key, stored.id);
  }

  for (const tag of tags) {
    const stored = await db.tag.upsert({
      where: { key: tag.key },
      update: tag,
      create: tag,
    });
    storedTags.set(tag.key, stored.id);
  }

  const primaryRules = [
    ["带小朋友优先", 600, "family-with-children", { fact: "childCount", operator: "greaterThan", value: 0 }],
    ["远道宾客优先", 500, "out-of-town", { fact: "isOutOfTown", operator: "equal", value: true }],
    ["男方亲友", 400, "groom-guests", { fact: "relation", operator: "in", value: ["GROOM_RELATIVE", "GROOM_FRIEND"] }],
    ["女方亲友", 300, "bride-guests", { fact: "relation", operator: "in", value: ["BRIDE_RELATIVE", "BRIDE_FRIEND"] }],
    ["共同好友", 200, "mutual-friends", { fact: "relation", operator: "in", value: ["MUTUAL_FRIEND", "COLLEAGUE", "CLASSMATE"] }],
    ["其他宾客", 100, "other-guests", { fact: "relation", operator: "equal", value: "OTHER" }],
  ] as const;

  for (const [name, priority, groupKey, condition] of primaryRules) {
    const existing = await db.groupingRule.findFirst({ where: { name, kind: "PRIMARY", version: 1 } });
    const data = {
      name,
      kind: "PRIMARY" as const,
      priority,
      conditions: { all: [condition] },
      targetGroupId: storedGroups.get(groupKey)!,
      enabled: true,
      version: 1,
    };
    if (existing) await db.groupingRule.update({ where: { id: existing.id }, data });
    else await db.groupingRule.create({ data });
  }

  const tagRules = [
    ["标签：带小朋友", 600, "with-children", { fact: "childCount", operator: "greaterThan", value: 0 }],
    ["标签：外地宾客", 500, "out-of-town", { fact: "isOutOfTown", operator: "equal", value: true }],
    ["标签：男方亲友", 400, "groom-side", { fact: "relation", operator: "in", value: ["GROOM_RELATIVE", "GROOM_FRIEND"] }],
    ["标签：女方亲友", 300, "bride-side", { fact: "relation", operator: "in", value: ["BRIDE_RELATIVE", "BRIDE_FRIEND"] }],
    ["标签：同事", 200, "colleague", { fact: "relation", operator: "equal", value: "COLLEAGUE" }],
    ["标签：同学", 100, "classmate", { fact: "relation", operator: "equal", value: "CLASSMATE" }],
  ] as const;

  for (const [name, priority, tagKey, condition] of tagRules) {
    const existing = await db.groupingRule.findFirst({ where: { name, kind: "TAG", version: 1 } });
    const data = {
      name,
      kind: "TAG" as const,
      priority,
      conditions: { all: [condition] },
      targetTagId: storedTags.get(tagKey)!,
      enabled: true,
      version: 1,
    };
    if (existing) await db.groupingRule.update({ where: { id: existing.id }, data });
    else await db.groupingRule.create({ data });
  }
}

async function main() {
  await db.weddingSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  await seedAdmin();
  await seedGroupsAndRules();
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });

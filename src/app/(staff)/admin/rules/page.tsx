import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RuleEditor } from "@/components/admin/RuleEditor";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const aggregate = await db.groupingRule.aggregate({ _max: { version: true } });
  const version = aggregate._max.version ?? 1;
  const [rules, groups, tags] = await Promise.all([
    db.groupingRule.findMany({ where: { version }, include: { targetGroup: true, targetTag: true }, orderBy: { priority: "desc" } }),
    db.group.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    db.tag.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <main className="admin-list-shell">
      <header className="admin-page-header"><div><p>现场指挥台</p><h1>分组规则</h1></div><nav><a href="/admin/guests">宾客名单</a></nav></header>
      <RuleEditor
        version={version}
        groups={groups.map(({ key, name }) => ({ key, name }))}
        tags={tags.map(({ key, name }) => ({ key, name }))}
        initialRules={rules.map((rule) => ({ id: rule.id, name: rule.name, kind: rule.kind, enabled: rule.enabled, priority: rule.priority, conditions: rule.conditions, targetGroupKey: rule.targetGroup?.key ?? null, targetTagKey: rule.targetTag?.key ?? null }))}
      />
    </main>
  );
}

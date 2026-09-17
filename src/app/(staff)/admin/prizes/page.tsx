import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PrizeManager } from "@/components/admin/PrizeManager";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PrizesPage() {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const [prizes, groups] = await Promise.all([
    db.prize.findMany({ include: { allowedGroups: true }, orderBy: { sortOrder: "asc" } }),
    db.group.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return <main className="admin-list-shell"><header className="admin-page-header"><div><p>现场指挥台</p><h1>奖品设置</h1></div><nav><a href="/admin">返回概览</a><a href="/draw">进入抽奖</a></nav></header><PrizeManager initialPrizes={prizes} groups={groups} /></main>;
}

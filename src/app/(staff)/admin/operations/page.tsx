import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const backups = await db.backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, checksum: true, createdAt: true } });
  return <main className="admin-list-shell"><header className="admin-page-header"><div><p>现场指挥台</p><h1>备份与应急</h1></div><nav><a href="/admin/audit">审计记录</a><a href="/admin">返回概览</a></nav></header><OperationsPanel initialBackups={backups.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} /></main>;
}

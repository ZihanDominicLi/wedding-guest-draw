import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const events = await db.auditEvent.findMany({ include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="admin-list-shell"><header className="admin-page-header"><div><p>现场指挥台</p><h1>审计记录</h1></div><a href="/admin">返回概览</a></header><div className="table-scroll audit-table-wrap"><table className="guest-table audit-table"><thead><tr><th>时间</th><th>操作</th><th>对象</th><th>操作人</th><th>理由</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{event.createdAt.toLocaleString("zh-CN")}</td><td><strong>{event.action}</strong></td><td>{event.entityType}<small>{event.entityId ?? "—"}</small></td><td>{event.actor?.name ?? "系统/公开端"}</td><td>{event.reason ?? "—"}</td></tr>)}</tbody></table>{!events.length ? <p className="empty-table">尚无审计记录</p> : null}</div></main>;
}

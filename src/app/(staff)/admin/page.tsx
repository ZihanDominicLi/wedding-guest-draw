import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OperationsDashboard } from "@/components/admin/OperationsDashboard";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { getAdminSnapshot } from "@/modules/live/snapshot";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let administrator;
  try {
    administrator = await requireAdmin(await headers());
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const snapshot = await getAdminSnapshot();
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><p>现场指挥台</p><h1>婚礼现场概览</h1><span>你好，{administrator.name}</span></div>
        <nav><a href="/admin/guests">宾客</a><a href="/admin/rules">规则</a><a href="/admin/prizes">奖品</a><a href="/admin/operations">运维</a><a href="/admin/settings">设置</a><a className="draw-link" href="/draw">进入抽奖</a></nav>
      </header>
      <OperationsDashboard initialSnapshot={snapshot} />
    </main>
  );
}

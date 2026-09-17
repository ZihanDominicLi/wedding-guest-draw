import { Download, Filter } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GuestTable } from "@/components/admin/GuestTable";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { listGuests } from "@/modules/guests/service";

export const dynamic = "force-dynamic";

export default async function GuestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const params = await searchParams;
  const [result, groups] = await Promise.all([
    listGuests({ query: params.query, primaryGroupKey: params.group, exception: params.exception === "true", page: Number(params.page) || 1 }),
    db.group.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <main className="admin-list-shell">
      <header className="admin-page-header">
        <div><p>现场指挥台</p><h1>宾客名单</h1></div>
        <nav>
          <a href="/admin/rules">分组规则</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- this endpoint downloads a CSV response */}
          <a href="/api/admin/guests?format=csv"><Download size={15} />导出 CSV</a>
        </nav>
      </header>
      <form className="guest-filters">
        <label><span className="sr-only">搜索宾客</span><input name="query" defaultValue={params.query} placeholder="搜索姓名" /></label>
        <label><span className="sr-only">主组筛选</span><select name="group" defaultValue={params.group ?? ""}><option value="">全部主组</option>{groups.map((group) => <option key={group.id} value={group.key}>{group.name}</option>)}</select></label>
        <label className="filter-check"><input name="exception" type="checkbox" value="true" defaultChecked={params.exception === "true"} />仅看未分组</label>
        <button type="submit"><Filter size={16} />筛选</button>
      </form>
      <div className="list-summary"><strong>{result.total}</strong><span>位成人宾客</span></div>
      <GuestTable
        groups={groups.map(({ id, name }) => ({ id, name }))}
        items={result.items.map((guest) => ({ ...guest, checkedInAt: guest.checkedInAt.toISOString() }))}
      />
    </main>
  );
}

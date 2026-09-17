import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireAdmin, UnauthorizedError } from "@/lib/auth";

export default async function AdminPage() {
  let administrator;

  try {
    administrator = await requireAdmin(await headers());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw error;
  }

  return (
    <main className="admin-placeholder">
      <p>现场指挥台</p>
      <h1>欢迎回来，{administrator.name}</h1>
      <span>数据概览将在下一阶段接入。</span>
      <a className="admin-placeholder-link" href="/admin/settings">婚礼与二维码设置</a>
    </main>
  );
}

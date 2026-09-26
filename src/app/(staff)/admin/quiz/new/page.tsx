import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { QuizCreateForm } from "@/components/quiz/QuizCreateForm";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewQuizPage() {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  return <main className="admin-list-shell"><header className="admin-page-header"><div><p>现场答题</p><h1>新建答题场次</h1></div><nav><a href="/admin/quiz">返回答题控制台</a></nav></header><QuizCreateForm /></main>;
}

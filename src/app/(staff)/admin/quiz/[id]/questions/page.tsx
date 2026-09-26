import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { QuizQuestionSettings } from "@/components/quiz/QuizQuestionSettings";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function QuizQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin(await headers()); } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const { id } = await params;
  const session = await db.quizSession.findUnique({ where: { id }, include: { questions: { orderBy: { order: "asc" } } } });
  if (!session) notFound();
  return <main className="admin-list-shell"><header className="admin-page-header"><div><p>现场答题</p><h1>{session.title}</h1><span className="admin-page-status">{session.status} · {session.questionCount} 题</span></div><nav><a href="/admin/quiz">返回答题控制台</a></nav></header><QuizQuestionSettings sessionId={session.id} sessionStatus={session.status} defaultTimeLimitSeconds={session.defaultTimeLimitSeconds} questions={session.questions.map((question) => ({ id: question.id, order: question.order, prompt: question.prompt, options: question.options, correctOption: question.correctOption, explanation: question.explanation, timeLimitSeconds: question.timeLimitSeconds }))} /></main>;
}

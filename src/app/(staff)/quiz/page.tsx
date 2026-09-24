import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { QuizHost } from "@/components/quiz/QuizHost";

export const dynamic = "force-dynamic";

export default async function QuizHostPage() {
  try { await requireAdmin(await import("next/headers").then(({ headers }) => headers())); } catch (error) { if (error instanceof UnauthorizedError) return <main className="admin-shell"><h1>需要管理员登录</h1></main>; throw error; }
  const sessions = await db.quizSession.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { _count: { select: { participants: true } } } });
  return <main className="admin-shell"><QuizHost initialSessions={sessions.map((session) => ({ id: session.id, title: session.title, status: session.status, participantCount: session._count.participants, currentQuestionIndex: session.currentQuestionIndex }))} /></main>;
}

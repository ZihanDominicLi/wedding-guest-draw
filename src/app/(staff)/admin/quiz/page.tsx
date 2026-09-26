import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { QuizHost } from "@/components/quiz/QuizHost";
import { getQuizSessionStats } from "@/modules/quiz/service";

export const dynamic = "force-dynamic";

export default async function QuizHostPage() {
  try { await requireAdmin(await import("next/headers").then(({ headers }) => headers())); } catch (error) { if (error instanceof UnauthorizedError) return <main className="admin-shell"><h1>需要管理员登录</h1></main>; throw error; }
  const sessions = await db.quizSession.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { questions: { orderBy: { order: "asc" } } } });
  const initialSessions = await Promise.all(sessions.map(async (session) => ({ title: session.title, status: session.status, phase: session.phase, version: session.version, currentRound: session.currentRound, pendingTransition: null, ...(await getQuizSessionStats(session.id)), currentQuestionIndex: session.currentQuestionIndex, defaultTimeLimitSeconds: session.defaultTimeLimitSeconds, questions: session.questions.map((question) => ({ id: question.id, order: question.order, prompt: question.prompt, options: question.options, correctOption: question.correctOption, explanation: question.explanation, timeLimitSeconds: question.timeLimitSeconds })) })));
  return <main className="admin-shell"><QuizHost initialSessions={initialSessions} /></main>;
}

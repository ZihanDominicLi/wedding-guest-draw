import { db } from "@/lib/db";
import { QuizParticipant } from "@/components/quiz/QuizParticipant";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const session = await db.quizSession.findFirst({ where: { status: { in: ["READY", "LIVE"] } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } });
  if (!session) return <main className="join-shell"><section className="registration-closed"><h1>答题尚未开始</h1><span>请等待主持人开始答题。</span></section></main>;
  return <main className="join-shell"><QuizParticipant sessionId={session.id} title={session.title} /></main>;
}

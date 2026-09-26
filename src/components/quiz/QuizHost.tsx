"use client";

import { useEffect, useState } from "react";

import { mergeQuizSessionStats, type QuizSessionStats } from "@/modules/quiz/admin-state";

type Question = { id: string; order: number; prompt: string; options: unknown; correctOption: number | null; explanation: string | null; timeLimitSeconds: number | null };
type Session = { id: string; title: string; status: string; participantCount: number; submittedCount: number; skippedCount: number; completedCount: number; averageScore: number; currentQuestionIndex: number | null; defaultTimeLimitSeconds: number; questions: Question[] };
export function QuizHost({ initialSessions }: { initialSessions: Session[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let events: EventSource | undefined;

    const refreshSession = async (sessionId: string) => {
      const response = await fetch(`/api/quiz/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: { session?: { status?: string; currentQuestionIndex?: number | null }; question?: Partial<Question> | null; stats?: QuizSessionStats } };
      const next = payload.data;
      if (!next?.session) return;
      setSessions((items) => {
        const updated = items.map((item) => item.id === sessionId ? {
          ...item,
          ...(next.session?.status ? { status: next.session.status } : {}),
          ...(next.session?.currentQuestionIndex !== undefined ? { currentQuestionIndex: next.session.currentQuestionIndex } : {}),
          ...(next.question ? { questions: item.questions.map((question) => question.id === next.question?.id ? { ...question, ...next.question } : question) } : {}),
        } : item);
        return next.stats ? mergeQuizSessionStats(updated, [next.stats]) : updated;
      });
    };

    const connect = () => {
      if (closed) return;
      events = new EventSource("/api/events/admin");
      events.addEventListener("quiz.changed", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { id?: string };
        if (payload.id) void refreshSession(payload.id);
      });
      events.onerror = () => {
        events?.close();
        if (!closed) reconnectTimer = setTimeout(connect, 1500);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      events?.close();
    };
  }, []);
  async function call(session: Session, action: string, body: object = {}) {
    setBusy(`${session.id}:${action}`); setMessage("");
    const response = await fetch(`/api/quiz/${session.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return setMessage(payload.error?.message ?? "操作失败");
    const next = payload.data?.session ?? payload.data;
    setSessions((items) => items.map((item) => item.id === session.id ? { ...item, ...(next?.status ? { status: next.status } : {}), ...(next?.currentQuestionIndex !== undefined ? { currentQuestionIndex: next.currentQuestionIndex } : {}) } : item));
  }
  async function deleteSession(session: Session) {
    if (session.status === "LIVE") return;
    if (!window.confirm(`确认删除答题场次“${session.title}”？该场次的题目、答题记录和宾客答题分数都会被清理，不能恢复。`)) return;
    setBusy(`${session.id}:delete`); setMessage("");
    const response = await fetch(`/api/quiz/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setMessage(payload.error?.message ?? "删除失败");
    setSessions((items) => items.filter((item) => item.id !== session.id));
  }
  return <section className="admin-panel"><header><p className="admin-eyebrow">Quiz control</p><h1>现场同步答题</h1><div className="quiz-host-header-actions"><a href="/admin/quiz/new">新建答题场次</a><a href="/quiz/screen" target="_blank" rel="noreferrer">打开答题大屏</a><a href="/quiz" target="_blank" rel="noreferrer">打开宾客答题页</a></div></header>{sessions.length ? sessions.map((session) => {
    const current = session.currentQuestionIndex ? session.questions.find((q) => q.order === session.currentQuestionIndex) : null;
    const review = session.status === "REVIEW";
    return <article key={session.id} className="admin-list-row"><div><strong>{session.title}</strong><span>{session.status} · {session.participantCount} 位参与者 · 当前题提交 {session.submittedCount} · 跳过 {session.skippedCount} · 完成 {session.completedCount} · 平均 {session.averageScore.toFixed(1)} 分 · {current ? `第 ${current.order} 题` : "未开始"}</span></div><div className="quiz-host-actions">
      {session.status === "DRAFT" ? <button disabled={Boolean(busy)} onClick={() => void call(session, "publish")}>发布场次</button> : null}
      {session.status === "READY" ? <button disabled={Boolean(busy)} onClick={() => void call(session, "start")}>开始第 1 题</button> : null}
      {session.status === "LIVE" ? <><button disabled={Boolean(busy)} onClick={() => void call(session, "close", { force: true })}>提前收卷</button><button disabled={Boolean(busy)} onClick={() => void call(session, "reveal")}>公布答案</button></> : null}
      {review && (session.currentQuestionIndex ?? 0) < session.questions.length ? <button disabled={Boolean(busy)} onClick={() => void call(session, "advance")}>开始下一题</button> : null}
      {review && (session.currentQuestionIndex ?? 0) >= session.questions.length ? <button disabled={Boolean(busy)} onClick={() => void call(session, "finish")}>结束并计分</button> : null}
      <a className="secondary-action" href={`/admin/quiz/${session.id}/questions`}>题目设置</a>
      {session.status !== "LIVE" ? <button className="danger-action" disabled={Boolean(busy)} onClick={() => void deleteSession(session)}>删除场次</button> : null}
    </div></article>;
  }) : <p>还没有答题场次，请新建一场答题。</p>}{message ? <p role="alert">{message}</p> : null}</section>;
}

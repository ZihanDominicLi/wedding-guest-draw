"use client";

import { useEffect, useRef, useState } from "react";

import { mergeQuizSessionStats, type QuizSessionStats } from "@/modules/quiz/admin-state";

type Question = { id: string; order: number; prompt: string; options: unknown; correctOption: number | null; explanation: string | null; timeLimitSeconds: number | null };
type Session = { id: string; title: string; status: string; phase: string; version: number; currentRound: number | null; pendingTransition: { toPhase: string; toQuestionIndex: number | null; toRound: number | null; effectiveAt: string } | null; participantCount: number; submittedCount: number; skippedCount: number; completedCount: number; averageScore: number; currentQuestionIndex: number | null; defaultTimeLimitSeconds: number; questions: Question[] };
export function QuizHost({ initialSessions }: { initialSessions: Session[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const sessionsRef = useRef(sessions);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => {
    const refreshSession = async (sessionId: string) => {
      const [stateResponse, statsResponse] = await Promise.all([
        fetch(`/api/events/${encodeURIComponent(sessionId)}/state`, { cache: "no-store" }),
        fetch(`/api/quiz/${encodeURIComponent(sessionId)}`, { cache: "no-store" }),
      ]);
      if (!stateResponse.ok || !statsResponse.ok) return;
      const statePayload = await stateResponse.json() as { data?: { phase: string; version: number; questionIndex: number | null; round: number | null; pendingTransition: Session["pendingTransition"] } };
      const statsPayload = await statsResponse.json() as { data?: { session?: { status?: string; currentQuestionIndex?: number | null }; question?: Partial<Question> | null; stats?: QuizSessionStats } };
      const state = statePayload.data;
      const next = statsPayload.data;
      if (!state || !next?.session) return;
      setSessions((items) => {
        const updated = items.map((item) => item.id === sessionId ? {
          ...item,
          ...(next.session?.status ? { status: next.session.status } : {}),
          phase: state.phase,
          version: state.version,
          currentRound: state.round,
          currentQuestionIndex: state.questionIndex,
          pendingTransition: state.pendingTransition,
          ...(next.question ? { questions: item.questions.map((question) => question.id === next.question?.id ? { ...question, ...next.question } : question) } : {}),
        } : item);
        return statsPayload.data?.stats ? mergeQuizSessionStats(updated, [statsPayload.data.stats]) : updated;
      });
    };
    const refreshAll = async () => {
      setSyncing(true);
      try { await Promise.all(sessionsRef.current.map((session) => refreshSession(session.id))); }
      finally { setSyncing(false); }
    };
    void refreshAll();
    const timer = window.setInterval(() => void refreshAll(), 5_000);
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    return () => { window.clearInterval(timer); window.clearInterval(clock); };
  }, []);
  async function call(session: Session, action: string, body: object = {}) {
    setBusy(`${session.id}:${action}`); setMessage("");
    const response = action === "publish"
      ? await fetch(`/api/quiz/${encodeURIComponent(session.id)}/publish`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) })
      : await fetch(`/api/events/${encodeURIComponent(session.id)}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedVersion: session.version, requestId: crypto.randomUUID() }) });
    const payload = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return setMessage(payload.error?.message ?? "操作失败");
    if (action === "publish") {
      const published = payload.data?.session ?? payload.data;
      setSessions((items) => items.map((item) => item.id === session.id ? { ...item, status: "READY", ...(published?.version ? { version: published.version } : {}) } : item));
    } else {
      const next = payload.data;
      setSessions((items) => items.map((item) => item.id === session.id ? { ...item, phase: next.phase, version: next.version, currentQuestionIndex: next.questionIndex, currentRound: next.round, pendingTransition: next.pendingTransition } : item));
    }
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
  return <section className="admin-panel"><header><p className="admin-eyebrow">Quiz control</p><h1>现场同步答题</h1><div className="quiz-host-header-actions"><a href="/admin/quiz/new">新建答题场次</a><a href="/quiz/screen" target="_blank" rel="noreferrer">打开答题大屏</a><a href="/quiz" target="_blank" rel="noreferrer">打开宾客答题页</a></div>{syncing ? <p role="status">正在同步现场状态…</p> : null}</header>{sessions.length ? sessions.map((session) => {
    const current = session.currentQuestionIndex ? session.questions.find((q) => q.order === session.currentQuestionIndex) : null;
    const pending = session.pendingTransition;
    const countdown = pending ? Math.max(0, Math.ceil((new Date(pending.effectiveAt).getTime() - now) / 1000)) : null;
    const disabled = Boolean(busy || syncing || pending);
    return <article key={session.id} className="admin-list-row"><div><strong>{session.title}</strong><span>{session.phase} · {session.participantCount} 位参与者 · 当前题提交 {session.submittedCount} · 跳过 {session.skippedCount} · 完成 {session.completedCount} · 平均 {session.averageScore.toFixed(1)} 分 · {current ? `第 ${current.order} 题` : "未开始"}</span>{pending ? <span role="status">将在 {countdown}s 后切换，页面正在等待统一状态</span> : null}</div><div className="quiz-host-actions">
      {session.status === "DRAFT" ? <button disabled={Boolean(busy)} onClick={() => void call(session, "publish")}>发布场次</button> : null}
      {session.phase === "REGISTRATION" && session.status !== "DRAFT" ? <button disabled={disabled} onClick={() => void call(session, "START")}>开始第 1 题</button> : null}
      {session.phase === "QUESTION" && (session.currentQuestionIndex ?? 0) < session.questions.length ? <button disabled={disabled} onClick={() => void call(session, "END_AND_NEXT")}>结束本题并进入下一题</button> : null}
      {session.phase === "QUESTION" && (session.currentQuestionIndex ?? 0) >= session.questions.length ? <button disabled={disabled} onClick={() => void call(session, "FINALIZE")}>结束答题并结算</button> : null}
      {session.phase === "SETTLING" ? <span role="status">正在结算，请等待结果生成…</span> : null}
      {session.phase === "QUIZ_ENDED" ? <button disabled={disabled} onClick={() => void call(session, "REVEAL_NEXT")}>揭晓第 1 轮</button> : null}
      {session.phase === "RESULTS" && (session.currentRound ?? 0) < 5 ? <button disabled={disabled} onClick={() => void call(session, "REVEAL_NEXT")}>揭晓第 {(session.currentRound ?? 0) + 1} 轮</button> : null}
      {session.phase === "RESULTS" && (session.currentRound ?? 0) >= 5 ? <button disabled={disabled} onClick={() => void call(session, "FINISH")}>结束活动</button> : null}
      <a className="secondary-action" href={`/admin/quiz/${session.id}/questions`}>题目设置</a>
      {session.status !== "LIVE" ? <button className="danger-action" disabled={Boolean(busy || syncing || pending)} onClick={() => void deleteSession(session)}>删除场次</button> : null}
    </div></article>;
  }) : <p>还没有答题场次，请新建一场答题。</p>}{message ? <p role="alert">{message}</p> : null}</section>;
}

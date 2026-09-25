"use client";

import { useState } from "react";

type Question = { id: string; order: number; prompt: string; options: unknown; correctOption: number; explanation: string | null; timeLimitSeconds: number | null };
type Session = { id: string; title: string; status: string; participantCount: number; submittedCount: number; skippedCount: number; completedCount: number; averageScore: number; currentQuestionIndex: number | null; defaultTimeLimitSeconds: number; questions: Question[] };
export function QuizHost({ initialSessions }: { initialSessions: Session[] }) {
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  async function call(session: Session, action: string, body: object = {}) {
    setBusy(`${session.id}:${action}`); setMessage("");
    const response = await fetch(`/api/quiz/${session.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return setMessage(payload.error?.message ?? "操作失败");
    const next = payload.data?.session ?? payload.data;
    setSessions((items) => items.map((item) => item.id === session.id ? { ...item, ...(next?.status ? { status: next.status } : {}), ...(next?.currentQuestionIndex !== undefined ? { currentQuestionIndex: next.currentQuestionIndex } : {}) } : item));
  }
  async function saveQuestion(session: Session, question: Question, patch: object) {
    setBusy(`${session.id}:question:${question.id}`);
    const response = await fetch(`/api/quiz/${session.id}/questions/${question.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const payload = await response.json().catch(() => ({})); setBusy(null);
    if (!response.ok) return setMessage(payload.error?.message ?? "题目保存失败");
    setSessions((items) => items.map((item) => item.id === session.id ? { ...item, questions: item.questions.map((q) => q.id === question.id ? { ...q, ...payload.data } : q) } : item));
    setMessage(`第 ${question.order} 题已保存`);
  }
  return <section className="admin-panel"><header><p className="admin-eyebrow">Quiz control</p><h1>现场同步答题</h1><a href="/quiz" target="_blank" rel="noreferrer">打开宾客答题页</a></header>{sessions.length ? sessions.map((session) => {
    const current = session.currentQuestionIndex ? session.questions.find((q) => q.order === session.currentQuestionIndex) : null;
    const review = session.status === "REVIEW";
    return <article key={session.id} className="admin-list-row"><div><strong>{session.title}</strong><span>{session.status} · {session.participantCount} 位参与者 · 当前题提交 {session.submittedCount} · 跳过 {session.skippedCount} · 完成 {session.completedCount} · 平均 {session.averageScore.toFixed(1)} 分 · {current ? `第 ${current.order} 题` : "未开始"}</span></div><div className="quiz-host-actions">
      {session.status === "DRAFT" ? <><button disabled={Boolean(busy)} onClick={() => void call(session, "publish")}>发布场次</button><button disabled={Boolean(busy)} onClick={() => setEditing(editing === session.id ? null : session.id)}>编辑题目</button></> : null}
      {session.status === "READY" ? <button disabled={Boolean(busy)} onClick={() => void call(session, "start")}>开始第 1 题</button> : null}
      {session.status === "LIVE" ? <><button disabled={Boolean(busy)} onClick={() => void call(session, "close", { force: true })}>提前收卷</button><button disabled={Boolean(busy)} onClick={() => void call(session, "reveal")}>公布答案</button></> : null}
      {review && (session.currentQuestionIndex ?? 0) < session.questions.length ? <button disabled={Boolean(busy)} onClick={() => void call(session, "advance")}>开始下一题</button> : null}
      {review && (session.currentQuestionIndex ?? 0) >= session.questions.length ? <button disabled={Boolean(busy)} onClick={() => void call(session, "finish")}>结束并计分</button> : null}
      <button className="secondary-action" onClick={() => setEditing(editing === session.id ? null : session.id)}>{editing === session.id ? "收起题目" : "查看题目"}</button>
    </div>{editing === session.id ? <div className="quiz-question-editor">{session.questions.map((question) => <QuestionEditor key={question.id} question={question} disabled={!['DRAFT', 'READY'].includes(session.status)} saving={busy === `${session.id}:question:${question.id}`} onSave={(patch) => void saveQuestion(session, question, patch)} />)}</div> : null}</article>;
  }) : <p>还没有答题场次，请通过 API 创建 10 道题的场次。</p>}{message ? <p role="alert">{message}</p> : null}</section>;
}

function QuestionEditor({ question, disabled, saving, onSave }: { question: Question; disabled: boolean; saving: boolean; onSave: (patch: object) => void }) {
  const [options, setOptions] = useState(Array.isArray(question.options) ? question.options.map(String) : []);
  const [prompt, setPrompt] = useState(question.prompt); const [time, setTime] = useState(question.timeLimitSeconds ?? 30); const [correct, setCorrect] = useState(question.correctOption);
  return <div className="quiz-question-row"><label>第 {question.order} 题<input value={prompt} disabled={disabled} onChange={(e) => setPrompt(e.target.value)} /></label><div className="quiz-options">{options.map((option, index) => <label key={index}><input type="radio" name={`correct-${question.id}`} checked={correct === index} disabled={disabled} onChange={() => setCorrect(index)} /><input aria-label={`第 ${question.order} 题选项 ${index + 1}`} value={option} disabled={disabled} onChange={(event) => setOptions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}</div><label>限时（秒）<input type="number" min={5} max={300} value={time} disabled={disabled} onChange={(e) => setTime(Number(e.target.value))} /></label><button disabled={disabled || saving || options.some((option) => !option.trim())} onClick={() => onSave({ prompt, options, correctOption: correct, timeLimitSeconds: time })}>{saving ? "保存中…" : "保存"}</button></div>;
}

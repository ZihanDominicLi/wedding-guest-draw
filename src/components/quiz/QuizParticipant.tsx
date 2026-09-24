"use client";

import { useEffect, useState } from "react";

type Props = { sessionId: string; title: string };
type State = { session: { status: string; currentQuestionIndex: number | null }; question: { id: string; order: number; prompt: string; options: unknown[]; closesAt: string | null } | null; participant: { score: number; status: string } };

export function QuizParticipant({ sessionId, title }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("正在连接答题现场…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`/api/quiz/${sessionId}/participant`, { cache: "no-store" });
    if (!response.ok) { setMessage("请先完成现场登记，再进入答题页面。"); return; }
    setState((await response.json()).data);
    setMessage("");
  }
  useEffect(() => { const timer = window.setInterval(() => void load(), 2500); window.setTimeout(() => void load(), 0); return () => window.clearInterval(timer); }, [sessionId]);
  async function submit() {
    if (!state?.question || busy) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/quiz/${sessionId}/answer`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ questionId: state.question.id, selectedOption: selected }) });
    const payload = await response.json();
    setMessage(response.ok ? (payload.data.late ? "本题已超时，等待下一题。" : "答案已提交，等待下一题。") : (payload.error?.message ?? "提交失败"));
    setBusy(false); setSelected(null); void load();
  }
  return <section className="registration-wizard"><header className="wizard-header"><p>{title}</p><span>{state?.participant ? `当前得分 ${state.participant.score} 分` : "同步答题"}</span></header><div className="wizard-stage">{state?.question ? <><p>第 {state.question.order} 题</p><h1>{state.question.prompt}</h1><div className="choice-list">{state.question.options.map((option, index) => <button className={selected === index ? "choice selected" : "choice"} key={index} type="button" onClick={() => setSelected(index)}>{String(option)}</button>)}</div><button className="primary-action" type="button" disabled={busy || selected === null} onClick={() => void submit()}>提交答案</button></> : <h1>{state?.session.status === "FINISHED" ? "答题已结束" : "等待主持人发布下一题"}</h1>}</div>{message ? <p className="submit-error">{message}</p> : null}</section>;
}

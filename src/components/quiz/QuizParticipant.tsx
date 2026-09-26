"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QuizTimer } from "./QuizTimer";

type Props = { sessionId: string; title: string };
type Answer = { questionId: string; selectedOption: number | null; accepted: boolean; isLate: boolean; isCorrect: boolean | null; score: number; published: boolean } | null;
type State = { session: { status: string; currentQuestionIndex: number | null; questionCount: number }; question: { id: string; order: number; prompt: string; options: unknown[]; closesAt: string | null; correctOption?: number; explanation?: string | null } | null; participant: { score: number; status: string; currentAnswer: Answer } };

export function QuizParticipant({ sessionId, title }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("正在连接答题现场…");
  const [registrationRequired, setRegistrationRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/quiz/${sessionId}/participant`, { cache: "no-store" });
      if (!response.ok) {
        setRegistrationRequired(response.status === 403);
        setMessage(response.status === 403 ? "当前手机没有登记凭证，请重新完成一次现场登记后再返回答题。" : "暂时无法连接答题服务，正在重试…");
        return;
      }
      const next = (await response.json()).data as State;
      setState(next); setSelected(next.participant.currentAnswer?.selectedOption ?? null); setMessage(""); setRegistrationRequired(false);
    } catch { setMessage("网络暂时中断，正在自动重连…"); }
  }, [sessionId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 1500);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  async function submit() {
    if (!state?.question || busy || state.participant.currentAnswer) return;
    setBusy(true); setMessage("");
    const response = await fetch(`/api/quiz/${sessionId}/answer`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ questionId: state.question.id, selectedOption: selected }) });
    const payload = await response.json();
    setMessage(response.ok ? (payload.data.late ? "本题已跳过，等待下一题。" : "本题已提交，不能修改。") : (payload.error?.message ?? "提交失败，请重试"));
    setBusy(false); void load();
  }
  const answer = state?.participant.currentAnswer;
  return <section className="registration-wizard"><header className="wizard-header"><p>{title}</p><span>{state?.participant ? `当前得分 ${state.participant.score} / ${state.session.questionCount}` : "同步答题"}</span></header><div className="wizard-stage">{state?.question ? <><div className="quiz-question-meta"><p>第 {state.question.order} 题 / 共 {state.session.questionCount} 题</p>{state.session.status === "LIVE" && !answer ? <QuizTimer closesAt={state.question.closesAt} /> : null}</div><h1>{state.question.prompt}</h1><div className="choice-list">{state.question.options.map((option, index) => <button className={selected === index ? "choice selected" : "choice"} key={index} type="button" disabled={Boolean(answer) || busy || state.session.status !== "LIVE"} onClick={() => setSelected(index)}>{String(option)}</button>)}</div>{answer ? <p role="status">{answer.isLate ? "本题已跳过" : answer.published ? (answer.isCorrect ? "回答正确 +1 分" : "回答错误") : "本题已提交，不能修改"}</p> : state.session.status === "LIVE" ? <button className="primary-action" type="button" disabled={busy || selected === null} onClick={() => void submit()}>提交答案</button> : <p>等待主持人操作…</p>}{answer?.published && state.question.correctOption !== undefined ? <p>正确答案：{String(state.question.options[state.question.correctOption])}{state.question.explanation ? ` · ${state.question.explanation}` : ""}</p> : null}</> : <h1>{state?.session.status === "FINISHED" ? `答题已结束，你的最终得分是 ${state?.participant.score ?? 0} 分` : "等待主持人发布下一题"}</h1>}</div>{message ? <p className="submit-error" role="alert">{message}{registrationRequired ? <> <Link href="/join">前往登记</Link></> : null}</p> : null}</section>;
}

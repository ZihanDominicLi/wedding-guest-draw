"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { QuizTimer } from "./QuizTimer";
import {
  enqueueAnswer,
  flushAnswerQueue,
  listPendingAnswers,
  type PendingAnswer,
} from "@/modules/quiz/answer-queue";

type Question = {
  id: string;
  order: number;
  prompt: string;
  options: unknown[];
  timeLimitSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  correctOption?: number | null;
  explanation?: string | null;
};

type ConfirmedAnswer = {
  questionId: string;
  submissionId: string;
  selectedOption: number | null;
  accepted: boolean;
  isLate: boolean;
  score: number | null;
  submittedAt: string;
};

type EventState = {
  eventId: string;
  phase: string;
  version: number;
  questionIndex: number | null;
  currentQuestion: Question | null;
  pendingTransition: { toQuestionIndex: number | null; effectiveAt: string } | null;
  me: {
    participantId: string;
    answers: ConfirmedAnswer[];
    totalScore: number | null;
  } | null;
  results: unknown[];
};

type SaveState = "saving" | "saved" | "retrying";

function newSubmissionId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function QuizParticipant({ sessionId, title }: { sessionId: string; title: string }) {
  const [state, setState] = useState<EventState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [message, setMessage] = useState("正在连接答题现场…");
  const [registrationRequired, setRegistrationRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const previousQuestionId = useRef<string | null>(null);
  const participantIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(sessionId)}/state`, { cache: "no-store" });
      if (!response.ok) {
        setRegistrationRequired(response.status === 403);
        setMessage(response.status === 403 ? "当前手机没有登记凭证，请重新完成一次现场登记后再返回答题。" : "暂时无法连接答题服务，正在重试…");
        setLoading(false);
        return;
      }
      const payload = await response.json() as { data: EventState };
      setState((previous) => previous && previous.version > payload.data.version ? previous : payload.data);
      participantIdRef.current = payload.data.me?.participantId ?? null;
      const pending = await listPendingAnswers();
      const queuedAnswer = payload.data.currentQuestion && payload.data.me
        ? pending.find((answer) => answer.eventId === sessionId && answer.participantId === payload.data.me?.participantId && answer.questionId === payload.data.currentQuestion?.id)
        : undefined;
      if (queuedAnswer && !payload.data.me?.answers.some((answer) => answer.questionId === queuedAnswer.questionId)) {
        setSelected(queuedAnswer.optionIndex);
        setSaveStates((current) => ({ ...current, [queuedAnswer.questionId]: "retrying" }));
      }
      setMessage("");
      setRegistrationRequired(false);
      setLoading(false);
      return payload.data;
    } catch {
      setMessage("网络暂时中断，正在自动重连…");
      setLoading(false);
      return null;
    }
  }, [sessionId]);

  const sendAnswer = useCallback(async (item: PendingAnswer) => {
    setSaveStates((current) => ({ ...current, [item.questionId]: "saving" }));
    const response = await fetch(`/api/events/${encodeURIComponent(item.eventId)}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: item.questionId, optionIndex: item.optionIndex, submissionId: item.submissionId }),
    });
    if (!response.ok) throw new Error(`Answer save failed (${response.status})`);
    setSaveStates((current) => ({ ...current, [item.questionId]: "saved" }));
  }, []);

  const flush = useCallback(async (participantId = participantIdRef.current) => {
    if (!participantId) return;
    const result = await flushAnswerQueue(sendAnswer, { eventId: sessionId, participantId });
    if (result.failed > 0) {
      const pending = await listPendingAnswers();
      setSaveStates((current) => {
        const next = { ...current };
        for (const item of pending.filter((answer) => answer.eventId === sessionId)) next[item.questionId] = "retrying";
        return next;
      });
    }
    if (result.removed > 0) void load();
  }, [load, sendAnswer, sessionId]);

  useEffect(() => {
    let disposed = false;
    const refreshAndFlush = async () => {
      const latest = await load();
      if (!disposed && latest?.me) await flush(latest.me.participantId);
    };
    const initial = window.setTimeout(() => void refreshAndFlush(), 0);
    const timer = window.setInterval(() => void refreshAndFlush(), 5_000);
    const onOnline = () => void refreshAndFlush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshAndFlush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush, load]);

  const currentQuestion = state?.currentQuestion ?? null;
  const confirmed = useMemo(
    () => currentQuestion ? state?.me?.answers.find((answer) => answer.questionId === currentQuestion.id) ?? null : null,
    [currentQuestion, state?.me?.answers],
  );
  const currentSaveState = currentQuestion ? saveStates[currentQuestion.id] : undefined;

  useEffect(() => {
    if (!currentQuestion) return;
    if (previousQuestionId.current !== currentQuestion.id) {
      if (previousQuestionId.current !== null) setSelected(null);
      previousQuestionId.current = currentQuestion.id;
    }
    if (confirmed) {
      queueMicrotask(() => {
        setSelected(confirmed.selectedOption);
        setSaveStates((current) => ({ ...current, [currentQuestion.id]: "saved" }));
      });
      return;
    }
  }, [confirmed, currentQuestion]);

  async function selectOption(optionIndex: number) {
    if (!currentQuestion || !state?.me || confirmed || selected !== null || state.phase !== "QUESTION") return;
    const submissionId = newSubmissionId();
    const item: PendingAnswer = {
      eventId: sessionId,
      participantId: state.me.participantId,
      questionId: currentQuestion.id,
      submissionId,
      optionIndex,
    };
    setSelected(optionIndex);
    setSaveStates((current) => ({ ...current, [currentQuestion.id]: "saving" }));
    try {
      await enqueueAnswer(item);
    void flush(state.me.participantId);
    } catch {
      setSaveStates((current) => ({ ...current, [currentQuestion.id]: "retrying" }));
    }
  }

  if (loading && !state) return <section className="registration-wizard quiz-participant"><div className="wizard-stage"><h1>正在同步答题状态…</h1></div></section>;

  return <section className="registration-wizard quiz-participant">
    <header className="wizard-header"><p>{title}</p><span>{state?.me ? `当前得分 ${state.me.totalScore ?? 0} 分` : "同步答题"}</span></header>
    <div className="wizard-stage">
      {currentQuestion ? <>
        <div className="quiz-question-meta"><p>第 {currentQuestion.order} 题</p>{state?.phase === "QUESTION" && !confirmed ? <QuizTimer closesAt={currentQuestion.closesAt} /> : null}</div>
        <h1>{currentQuestion.prompt}</h1>
        <div className="choice-list">{currentQuestion.options.map((option, index) => <button className={selected === index ? "choice selected" : "choice"} key={index} type="button" disabled={Boolean(confirmed) || selected !== null || state?.phase !== "QUESTION"} onClick={() => void selectOption(index)}>{String(option)}</button>)}</div>
        {confirmed ? <p role="status">{confirmed.isLate ? "本题已跳过" : "已保存，答案不能修改"}</p> : currentSaveState === "saving" ? <p role="status">保存中…</p> : currentSaveState === "retrying" ? <p role="status">网络中断，将自动重试</p> : currentSaveState === "saved" ? <p role="status">已保存，答案不能修改</p> : state?.phase === "QUESTION" ? <p role="status">请选择一个选项</p> : <p role="status">等待主持人操作…</p>}
      </> : <h1>{state?.phase === "FINISHED" ? `答题已结束，你的最终得分是 ${state.me?.totalScore ?? 0} 分` : "等待主持人发布下一题"}</h1>}
    </div>
    {message ? <p className="submit-error" role="alert">{message}{registrationRequired ? <> <Link href="/join">前往登记</Link></> : null}</p> : null}
  </section>;
}

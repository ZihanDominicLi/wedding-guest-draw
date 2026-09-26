"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { QuizParticipant } from "./QuizParticipant";

type CurrentQuiz = { session: { id: string; title: string } };

export function QuizLobby() {
  const [quiz, setQuiz] = useState<CurrentQuiz | null>(null);
  const [registrationRequired, setRegistrationRequired] = useState(false);

  const checkForQuiz = useCallback(async () => {
    try {
      const response = await fetch("/api/quiz/current", { cache: "no-store" });
      if (response.status === 403) {
        setRegistrationRequired(true);
        return;
      }
      if (!response.ok) return;
      const payload = (await response.json()) as { data: CurrentQuiz };
      setRegistrationRequired(false);
      setQuiz(payload.data);
    } catch {
      // Keep waiting; the next poll retries without changing the answer timer.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void checkForQuiz(), 0);
    const timer = window.setInterval(() => void checkForQuiz(), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [checkForQuiz]);

  if (quiz) return <QuizParticipant sessionId={quiz.session.id} title={quiz.session.title} />;

  return (
    <section className="registration-closed">
      <h1>{registrationRequired ? "请先完成现场登记" : "答题尚未开始"}</h1>
      <span>
        {registrationRequired
          ? "当前手机没有登记凭证，完成登记后即可返回本页。"
          : "登记已保留，请等待主持人发布答题场次。发布后本页会自动进入答题。"}
      </span>
      {registrationRequired ? <Link className="primary-action" href="/join">前往登记</Link> : null}
    </section>
  );
}

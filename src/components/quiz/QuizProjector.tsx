"use client";

import { useEffect, useState } from "react";

import type { ScreenSnapshot } from "@/components/draw/projector-state";
import { QuizTimer } from "./QuizTimer";

export function QuizProjector() {
  const [snapshot, setSnapshot] = useState<ScreenSnapshot | null>(null);

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/screen", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { data: ScreenSnapshot };
        setSnapshot(payload.data);
      } catch {
        // EventSource reconnects automatically; the next event can refresh the snapshot.
      }
    };

    const events = new EventSource("/api/events/screen");
    events.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data) as ScreenSnapshot);
    });
    for (const type of ["quiz.question_opened", "quiz.question_closed", "quiz.answer_published", "quiz.finished"]) {
      events.addEventListener(type, () => void refresh());
    }
    void refresh();
    return () => events.close();
  }, []);

  const quiz = snapshot?.quiz;
  const question = quiz?.question;
  const background = snapshot?.settings.screenBackgroundPath;
  const style = background ? { backgroundImage: `url(${background})` } : undefined;

  return (
    <main className="quiz-projector-screen">
      <div className="projector-backdrop" aria-hidden="true" style={style} />
      <div className="projector-shade" aria-hidden="true" />
      {question ? (
        <section className="quiz-projector-content" aria-live="polite">
          <header className="quiz-projector-header">
            <p>现场同步答题</p>
            <span>第 {question.order} 题</span>
            {quiz.status === "LIVE" ? <QuizTimer closesAt={question.closesAt} /> : null}
          </header>
          <h1>{question.prompt}</h1>
          <ol className="quiz-projector-options" aria-label="题目选项">
            {question.options.map((option, index) => (
              <li key={index}>
                <span className="quiz-projector-option-label">{String.fromCharCode(65 + index)}</span>
                <span className="quiz-projector-option-text">{String(option)}</span>
              </li>
            ))}
          </ol>
          {quiz.status !== "LIVE" && question.correctOption !== undefined ? (
            <p className="quiz-projector-answer">
              正确答案：{String(question.options[question.correctOption])}
              {question.explanation ? ` · ${question.explanation}` : ""}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="quiz-projector-waiting" aria-live="polite">
          <p>现场同步答题</p>
          <h1>{quiz?.status === "FINISHED" ? "本轮答题已结束" : "等待主持人发布题目"}</h1>
        </section>
      )}
    </main>
  );
}

"use client";

import type { ScreenSnapshot } from "@/components/draw/projector-state";
import { useEventStatePolling } from "@/lib/polling/useEventStatePolling";
import { QuizTimer } from "./QuizTimer";

export function QuizProjector() {
  const { state: snapshot } = useEventStatePolling<ScreenSnapshot>({ url: "/api/screen" });

  const quiz = snapshot?.quiz;
  const question = quiz?.question;
  const showQuestion = Boolean(question && (quiz?.phase === "QUESTION" || (!quiz?.phase && quiz?.status === "LIVE")));
  const background = snapshot?.settings.screenBackgroundPath;
  const style = background ? { backgroundImage: `url(${background})` } : undefined;

  return (
    <main className="quiz-projector-screen">
      <div className="projector-backdrop" aria-hidden="true" style={style} />
      <div className="projector-shade" aria-hidden="true" />
      {showQuestion && question ? (
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
      ) : quiz?.phase === "RESULTS" || quiz?.phase === "FINISHED" ? (
        <section className="quiz-projector-content" aria-live="polite">
          <header className="quiz-projector-header">
            <p>答题抽奖结果</p>
            <span>{quiz.phase === "FINISHED" ? "全部轮次" : `第 ${quiz.results.at(-1)?.round ?? quiz.currentQuestionIndex ?? 1} 轮`}</span>
          </header>
          {quiz.results.length ? <ol className="quiz-projector-options" aria-label="已揭晓中奖名单">
            {quiz.results.at(-1)?.winners.map((winner) => <li key={winner.id}><span className="quiz-projector-option-text">{winner.name}{winner.score === null ? "" : ` · ${winner.score} 分`}</span></li>)}
          </ol> : <h1>暂无已揭晓结果</h1>}
        </section>
      ) : (
        <section className="quiz-projector-waiting" aria-live="polite">
          <p>现场同步答题</p>
          <h1>{quiz?.phase === "QUIZ_ENDED" || quiz?.phase === "SETTLING" ? "正在结算，等待主持人揭晓结果" : quiz?.status === "FINISHED" ? "本轮答题已结束" : "等待主持人发布题目"}</h1>
        </section>
      )}
    </main>
  );
}

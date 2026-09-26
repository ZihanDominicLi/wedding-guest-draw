"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

type Question = {
  id: string;
  order: number;
  prompt: string;
  options: unknown;
  correctOption: number | null;
  explanation: string | null;
  timeLimitSeconds: number | null;
};

export function QuizQuestionSettings({ sessionId, sessionStatus, questions, defaultTimeLimitSeconds }: { sessionId: string; sessionStatus: string; questions: Question[]; defaultTimeLimitSeconds: number }) {
  const locked = !["DRAFT", "READY"].includes(sessionStatus);
  const [items, setItems] = useState(questions.map((question) => ({ ...question, options: Array.isArray(question.options) ? question.options.map(String) : [] })));
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function update(id: string, patch: Partial<(typeof items)[number]>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save(question: (typeof items)[number]) {
    setSaving(question.id);
    setMessage("");
    const response = await fetch(`/api/quiz/${sessionId}/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: question.prompt, options: question.options, correctOption: question.correctOption, explanation: question.explanation, timeLimitSeconds: question.timeLimitSeconds ?? defaultTimeLimitSeconds }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(null);
    if (!response.ok) { setMessage(payload.error?.message ?? "保存失败"); return; }
    setMessage(`第 ${question.order} 题已保存`);
  }

  return <section className="quiz-settings-list">
    <div className="quiz-settings-note"><span>{locked ? "场次已开始，题目设置已锁定。" : "发布场次前请为每道题选择正确答案。"}</span><strong>{items.filter((question) => question.correctOption !== null).length} / {items.length} 已设置答案</strong></div>
    {items.map((question) => <article className="quiz-settings-card" key={question.id}>
      <header><span>第 {question.order} 题</span>{question.correctOption === null ? <em>未设置正确答案</em> : <em className="configured">已设置答案</em>}</header>
      <label><span>题目</span><textarea value={question.prompt} disabled={locked} onChange={(event) => update(question.id, { prompt: event.target.value })} /></label>
      <div className="quiz-settings-options"><span>选项（点击单选框设置正确答案）</span>{question.options.map((option, index) => <div className="quiz-option-editor" key={`${question.id}-${index}`}><input aria-label={`第 ${question.order} 题正确答案选项 ${index + 1}`} type="radio" name={`correct-${question.id}`} checked={question.correctOption === index} disabled={locked} onChange={() => update(question.id, { correctOption: index })} /><input value={option} disabled={locked} onChange={(event) => update(question.id, { options: question.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /><button type="button" title="删除选项" aria-label="删除选项" disabled={locked || question.options.length <= 2} onClick={() => update(question.id, { options: question.options.filter((_, itemIndex) => itemIndex !== index), correctOption: question.correctOption === index ? null : question.correctOption !== null && question.correctOption > index ? question.correctOption - 1 : question.correctOption })}><Trash2 size={15} /></button></div>)}{question.options.length < 8 && !locked ? <button className="quiz-add-option" type="button" onClick={() => update(question.id, { options: [...question.options, ""] })}><Plus size={15} />添加选项</button> : null}</div>
      <div className="quiz-settings-footer"><label><span>本题限时（秒）</span><input type="number" min={5} max={300} value={question.timeLimitSeconds ?? defaultTimeLimitSeconds} disabled={locked} onChange={(event) => update(question.id, { timeLimitSeconds: Number(event.target.value) })} /></label><button className="primary-action" type="button" disabled={locked || saving === question.id || question.prompt.trim().length === 0 || question.options.some((option) => !option.trim())} onClick={() => void save(question)}><Save size={16} />{saving === question.id ? "保存中" : "保存本题"}</button></div>
    </article>)}
    {message ? <p role="status" className="quiz-settings-message">{message}</p> : null}
  </section>;
}

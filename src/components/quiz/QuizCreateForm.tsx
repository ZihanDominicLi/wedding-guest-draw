"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { defaultQuizQuestions, defaultQuizTitle } from "@/modules/quiz/defaults";

export function QuizCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState(defaultQuizTitle);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function create() {
    setPending(true); setMessage("");
    const response = await fetch("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ title, defaultTimeLimitSeconds: 30, questions: defaultQuizQuestions }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setPending(false); setMessage(payload.error?.message ?? "创建失败"); return; }
    const id = payload.data?.session?.id;
    if (id) router.push(`/admin/quiz/${id}/questions`); else setMessage("创建成功，但未返回场次编号");
    setPending(false);
  }
  return <section className="quiz-create-form"><label><span>答题场次名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><p>将创建 7 道草稿题目，每题默认限时 30 秒。正确答案在题目设置页中选择。</p><button className="primary-action" type="button" disabled={pending || !title.trim()} onClick={() => void create()}>{pending ? "创建中" : "创建答题场次"}</button>{message ? <p role="alert">{message}</p> : null}</section>;
}

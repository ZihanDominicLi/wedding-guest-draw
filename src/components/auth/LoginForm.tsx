"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        rememberMe: true,
      }),
    });

    if (!response.ok) {
      setError("邮箱或密码不正确");
      setPending(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="login-mark" aria-hidden="true">
        <LockKeyhole size={22} strokeWidth={1.7} />
      </div>
      <div>
        <p className="login-kicker">Staff access</p>
        <h1>现场工作台</h1>
        <p className="login-summary">请使用管理员账号登录。</p>
      </div>

      <label>
        <span>管理员邮箱</span>
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        <span>密码</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={12}
          required
        />
      </label>

      {error ? <p className="login-error" role="alert">{error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" size={19} aria-hidden="true" />
        ) : (
          <ArrowRight size={19} aria-hidden="true" />
        )}
        {pending ? "正在登录" : "进入后台"}
      </button>
    </form>
  );
}

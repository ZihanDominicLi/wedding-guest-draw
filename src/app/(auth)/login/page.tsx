import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <LoginForm />
      <p className="login-footnote">婚礼现场管理 · 仅限工作人员</p>
    </main>
  );
}

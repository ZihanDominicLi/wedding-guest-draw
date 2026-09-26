import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type RegistrationSuccessProps = {
  result: {
    attendanceNumber: number;
    primaryGroup: { key: string; name: string } | null;
    created: boolean;
    quizAccess?: { available: boolean; sessionId?: string };
  };
};

export function RegistrationSuccess({ result }: RegistrationSuccessProps) {
  const router = useRouter();

  useEffect(() => {
    if (!result.quizAccess?.available) return;
    const timeout = window.setTimeout(() => router.replace("/quiz"), 1800);
    return () => window.clearTimeout(timeout);
  }, [result.quizAccess?.available, router]);

  return (
    <section className="registration-success">
      <span className="success-icon" aria-hidden="true"><Check size={32} /></span>
      <p className="success-kicker">Checked in</p>
      <h1>登记成功</h1>
      <p>{result.created ? "欢迎来到婚礼现场" : "已为你更新现场登记信息"}</p>
      <dl>
        <div><dt>抽奖分组</dt><dd>{result.primaryGroup?.name ?? "待工作人员确认"}</dd></div>
        <div><dt>现场编号</dt><dd>#{String(result.attendanceNumber).padStart(3, "0")}</dd></div>
      </dl>
      {result.quizAccess?.available ? (
        <div className="quiz-ready">
          <p role="status">登记完成，正在进入答题页面…</p>
          <Link className="primary-action" href="/quiz">立即进入答题</Link>
        </div>
      ) : null}
    </section>
  );
}

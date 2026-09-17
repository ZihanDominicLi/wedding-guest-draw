import { Check } from "lucide-react";

type RegistrationSuccessProps = {
  result: {
    attendanceNumber: number;
    primaryGroup: { key: string; name: string } | null;
    created: boolean;
  };
};

export function RegistrationSuccess({ result }: RegistrationSuccessProps) {
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
    </section>
  );
}

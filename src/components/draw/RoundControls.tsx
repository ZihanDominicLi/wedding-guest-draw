import { Ban, LockKeyhole, Play, Send } from "lucide-react";

type Status = "PREPARING" | "LOCKED" | "DRAWN" | "PUBLISHED" | "CANCELLED";

export function RoundControls({ status, pending, onAdvance, onCancel }: { status: Status; pending: boolean; onAdvance: () => void; onCancel: () => void }) {
  const action = status === "PREPARING" ? { label: "锁定候选名单", icon: LockKeyhole } : status === "LOCKED" ? { label: "开始抽取", icon: Play } : status === "DRAWN" ? { label: "公布中奖结果", icon: Send } : null;
  if (!action) return <p className="round-complete">{status === "PUBLISHED" ? "本轮结果已公布" : "本轮已取消"}</p>;
  const Icon = action.icon;
  return <div className="round-controls"><button className="draw-primary" type="button" onClick={onAdvance} disabled={pending}><Icon size={21} />{pending ? "正在处理" : action.label}</button><button className="draw-cancel" title="取消本轮" type="button" onClick={onCancel} disabled={pending}><Ban size={19} /></button></div>;
}

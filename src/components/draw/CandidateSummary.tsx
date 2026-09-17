import { Monitor, Users } from "lucide-react";

export function CandidateSummary({ candidateCount, screenConnected }: { candidateCount: number | null; screenConnected: boolean }) {
  return <div className="candidate-summary"><span><Users size={18} /><strong>{candidateCount ?? "—"}</strong><small>锁定候选</small></span><span><Monitor size={18} /><strong>{screenConnected ? "在线" : "未连接"}</strong><small>仪式大屏</small></span></div>;
}

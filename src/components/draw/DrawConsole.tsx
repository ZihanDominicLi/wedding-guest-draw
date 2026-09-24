"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Gift, RotateCcw } from "lucide-react";

import { CandidateSummary } from "./CandidateSummary";
import { RoundControls } from "./RoundControls";

type Prize = { id: string; name: string; imagePath: string | null; plannedWinnerCount: number; groupIds: string[] };
type Group = { id: string; name: string; eligibleCount: number };
type Round = { id: string; status: "PREPARING" | "LOCKED" | "DRAWN" | "PUBLISHED" | "CANCELLED"; version: number; candidateCount?: number; winners: Array<{ id: string; name: string; status: string }>; prizeId: string; targetGroupId: string; winnerCount: number; actualScoreThreshold?: number | null; scoreFallbackCount?: number | null };

function operationKey(action: string) { return `${action}-${crypto.randomUUID()}`; }

export function DrawConsole({ prizes, groups, screenConnected }: { prizes: Prize[]; groups: Group[]; screenConnected: boolean }) {
  const [prizeId, setPrizeId] = useState(prizes[0]?.id ?? "");
  const selectedPrize = prizes.find((prize) => prize.id === prizeId);
  const allowedGroups = useMemo(() => groups.filter((group) => selectedPrize?.groupIds.includes(group.id)), [groups, selectedPrize]);
  const [groupId, setGroupId] = useState(allowedGroups[0]?.id ?? "");
  const [winnerCount, setWinnerCount] = useState(selectedPrize?.plannedWinnerCount ?? 1);
  const [scoreThreshold, setScoreThreshold] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function selectPrize(id: string) {
    const prize = prizes.find((item) => item.id === id);
    const firstGroup = groups.find((group) => prize?.groupIds.includes(group.id));
    setPrizeId(id); setGroupId(firstGroup?.id ?? ""); setWinnerCount(prize?.plannedWinnerCount ?? 1);
  }

  async function request(path: string, data: object, action: string) {
    setPending(true); setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey(action) }, body: JSON.stringify(data) });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(payload.error?.message ?? "操作失败"); return null; }
    setRound(payload.data); return payload.data as Round;
  }

  async function create() {
    if (!prizeId || !groupId) return setMessage("请先选择奖品和参与组");
    await request("/api/draw/rounds", { prizeId, targetGroupId: groupId, winnerCount, ...(scoreThreshold > 0 ? { scoreThreshold, scoreFallbackStep: 1 } : {}) }, "create");
  }

  async function advance() {
    if (!round) return;
    const action = round.status === "PREPARING" ? "lock" : round.status === "LOCKED" ? "draw" : "publish";
    await request(`/api/draw/rounds/${round.id}/${action}`, { expectedVersion: round.version }, action);
  }

  async function cancel() {
    if (!round || !window.confirm("确认取消本轮？已保留的中奖名额会立即释放。")) return;
    await request(`/api/draw/rounds/${round.id}/cancel`, { expectedVersion: round.version, reason: "主持人取消本轮" }, "cancel");
  }

  const activeGroup = groups.find((group) => group.id === groupId);
  return <div className="draw-console">
    <header className="draw-console-header"><div><p>Draw Control</p><h1>仪式抽奖台</h1></div><nav><a href="/admin/prizes">奖品设置</a><a href="/screen" target="_blank">打开大屏 <ExternalLink size={14} /></a></nav></header>
    {!prizes.length ? <section className="draw-empty"><Gift size={28} /><h2>请先配置奖品</h2><a href="/admin/prizes">前往奖品设置</a></section> : null}
    {prizes.length && !round ? <section className="draw-setup"><header><p className="admin-eyebrow">Round setup</p><h2>新建抽奖轮次</h2></header><div className="draw-fields"><label><span>奖品</span><select value={prizeId} onChange={(event) => selectPrize(event.target.value)}>{prizes.map((prize) => <option key={prize.id} value={prize.id}>{prize.name}</option>)}</select></label><label><span>参与主组</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)}>{allowedGroups.map((group) => <option key={group.id} value={group.id}>{group.name}（{group.eligibleCount} 人）</option>)}</select></label><label><span>中奖人数</span><input type="number" min="1" max={activeGroup?.eligibleCount ?? 500} value={winnerCount} onChange={(event) => setWinnerCount(Number(event.target.value))} /></label><label><span>最低答题分数（0 为不限制）</span><input type="number" min="0" max="10" value={scoreThreshold} onChange={(event) => setScoreThreshold(Number(event.target.value))} /></label></div><button className="create-round" onClick={create} disabled={pending || !groupId}>创建轮次</button></section> : null}
    {round ? <section className="active-round"><header><div><p className="admin-eyebrow">Active round</p><h2>{selectedPrize?.name}</h2><span>{activeGroup?.name} · {round.winnerCount} 个名额</span></div><b data-status={round.status}>{round.status}</b></header><CandidateSummary candidateCount={round.candidateCount ?? null} screenConnected={screenConnected} />{round.actualScoreThreshold !== undefined ? <p>实际答题分数门槛：{round.actualScoreThreshold ?? "不限制"}{round.scoreFallbackCount ? `（已下调 ${round.scoreFallbackCount} 格）` : ""}</p> : null}{round.winners.length ? <div className="console-winners"><p>服务器已持久化结果</p>{round.winners.map((winner) => <strong key={winner.id}>{winner.name}</strong>)}</div> : null}<RoundControls status={round.status} pending={pending} onAdvance={advance} onCancel={cancel} />{["PUBLISHED", "CANCELLED"].includes(round.status) ? <button className="new-round" onClick={() => { setRound(null); setMessage(""); }}><RotateCcw size={17} />新建下一轮</button> : null}</section> : null}
    {message ? <p className="draw-message" role="alert">{message}</p> : null}
  </div>;
}

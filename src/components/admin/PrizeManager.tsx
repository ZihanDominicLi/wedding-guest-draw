"use client";

import { FormEvent, useState } from "react";
import { Gift, ImageUp, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import Image from "next/image";

type Group = { id: string; name: string };
type Prize = { id: string; name: string; imagePath: string | null; plannedWinnerCount: number; sortOrder: number; enabled: boolean; allowedGroups: Array<{ groupId: string }> };

export function PrizeManager({ initialPrizes, groups }: { initialPrizes: Prize[]; groups: Group[] }) {
  const [prizes, setPrizes] = useState(initialPrizes);
  const [editing, setEditing] = useState<Prize | null | "new">(null);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await fetch(editing === "new" ? "/api/admin/prizes" : `/api/admin/prizes/${editing?.id}`, { method: editing === "new" ? "POST" : "PUT", body: new FormData(form) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error?.message ?? "保存失败");
    setPrizes((current) => editing === "new" ? [...current, payload.data].sort((a, b) => a.sortOrder - b.sortOrder) : current.map((item) => item.id === payload.data.id ? payload.data : item));
    setEditing(null);
    setMessage("奖品已保存");
  }

  async function disable(prize: Prize) {
    if (!window.confirm(`停用“${prize.name}”？已完成的抽奖记录不会删除。`)) return;
    const response = await fetch(`/api/admin/prizes/${prize.id}`, { method: "DELETE" });
    if (response.ok) setPrizes((current) => current.map((item) => item.id === prize.id ? { ...item, enabled: false } : item));
  }

  return (
    <section className="prize-manager">
      <div className="prize-toolbar">
        <p>{prizes.filter((prize) => prize.enabled).length} 个启用奖品</p>
        <button type="button" onClick={() => { setEditing("new"); setMessage(""); }}><Plus size={17} />添加奖品</button>
      </div>
      <div className="prize-list">
        {prizes.map((prize) => (
          <article className={prize.enabled ? "prize-row" : "prize-row disabled"} key={prize.id}>
            <div className="prize-thumb">{prize.imagePath ? <Image src={prize.imagePath} alt="" width={48} height={48} unoptimized /> : <Gift size={22} />}</div>
            <div><strong>{prize.name}</strong><small>{prize.plannedWinnerCount} 个名额 · {prize.allowedGroups.length} 个可抽组</small></div>
            <span>{prize.enabled ? "启用" : "已停用"}</span>
            <button className="icon-button" title="编辑奖品" onClick={() => { setEditing(prize); setMessage(""); }}><Pencil size={16} /></button>
            {prize.enabled ? <button className="icon-button" title="停用奖品" onClick={() => disable(prize)}><Trash2 size={16} /></button> : null}
          </article>
        ))}
        {!prizes.length ? <p className="empty-table">尚未配置奖品</p> : null}
      </div>
      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {editing ? (
        <div className="impact-backdrop" role="presentation">
          <form className="prize-dialog" onSubmit={submit}>
            <header><div><p className="admin-eyebrow">Prize</p><h2>{editing === "new" ? "添加奖品" : "编辑奖品"}</h2></div><button type="button" className="icon-button" title="关闭" onClick={() => setEditing(null)}><X size={17} /></button></header>
            <label><span>奖品名称</span><input name="name" required maxLength={80} defaultValue={editing === "new" ? "" : editing.name} /></label>
            <div className="prize-form-grid">
              <label><span>计划中奖人数</span><input name="plannedWinnerCount" type="number" min="1" max="500" required defaultValue={editing === "new" ? 1 : editing.plannedWinnerCount} /></label>
              <label><span>显示顺序</span><input name="sortOrder" type="number" min="0" required defaultValue={editing === "new" ? prizes.length + 1 : editing.sortOrder} /></label>
            </div>
            <label className="prize-image-field"><span><ImageUp size={16} />奖品图片</span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <fieldset><legend>允许参与的主组</legend>{groups.map((group) => <label key={group.id}><input name="groupIds" type="checkbox" value={group.id} defaultChecked={editing === "new" || editing.allowedGroups.some((item) => item.groupId === group.id)} /><span>{group.name}</span></label>)}</fieldset>
            <label className="check-row"><input name="enabled" type="checkbox" defaultChecked={editing === "new" || editing.enabled} /><span>启用该奖品</span></label>
            {message ? <p className="dialog-error">{message}</p> : null}
            <footer><button type="submit"><Save size={17} />保存奖品</button></footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}

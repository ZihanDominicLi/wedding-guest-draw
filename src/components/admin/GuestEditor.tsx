"use client";

import { FormEvent, useRef, useState } from "react";
import { Lock, Pencil, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

type GuestEditorProps = {
  guest: {
    id: string;
    name: string;
    primaryGroupId: string | null;
    groupLocked: boolean;
    enabled: boolean;
  };
  groups: Array<{ id: string; name: string }>;
};

export function GuestEditor({ guest, groups }: GuestEditorProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/guests/${guest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        primaryGroupId: form.get("primaryGroupId") || null,
        groupLocked: form.get("groupLocked") === "on",
        enabled: form.get("enabled") === "on",
      }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "保存失败");
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`确定删除“${guest.name}”？这会同时删除该宾客的中奖记录和候选快照，不能撤销。`)) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/admin/guests/${guest.id}`, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "删除失败");
      return;
    }
    dialogRef.current?.close();
    router.refresh();
  }

  return (
    <>
      <button className="icon-button" type="button" title="编辑宾客" onClick={() => dialogRef.current?.showModal()}>
        <Pencil size={16} aria-hidden="true" />
      </button>
      <dialog className="guest-dialog" ref={dialogRef}>
        <form onSubmit={submit}>
          <header>
            <div><p className="admin-eyebrow">Guest record</p><h2>编辑宾客</h2></div>
            <button className="icon-button" type="button" title="关闭" onClick={() => dialogRef.current?.close()}>
              <X size={18} />
            </button>
          </header>
          <label><span>姓名</span><input name="name" defaultValue={guest.name} required /></label>
          <label><span>主抽奖组</span>
            <select name="primaryGroupId" defaultValue={guest.primaryGroupId ?? ""}>
              <option value="">未分组</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label className="check-row"><input name="groupLocked" type="checkbox" defaultChecked={guest.groupLocked} /><span><Lock size={15} />锁定人工分组</span></label>
          <label className="check-row"><input name="enabled" type="checkbox" defaultChecked={guest.enabled} /><span>允许参与抽奖</span></label>
          {error ? <p className="dialog-error" role="alert">{error}</p> : null}
          <footer>
            <button className="danger-button" type="button" onClick={remove} disabled={pending}><Trash2 size={17} />删除宾客</button>
            <button type="submit" disabled={pending}><Save size={17} />{pending ? "保存中" : "保存"}</button>
          </footer>
        </form>
      </dialog>
    </>
  );
}

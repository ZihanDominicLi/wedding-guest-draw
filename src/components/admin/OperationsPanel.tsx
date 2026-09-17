"use client";

import { useState } from "react";
import { DatabaseBackup, Download, LoaderCircle } from "lucide-react";

type Backup = { id: string; checksum: string; createdAt: string };

export function OperationsPanel({ initialBackups }: { initialBackups: Backup[] }) {
  const [backups, setBackups] = useState(initialBackups);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function backup() {
    setPending(true); setMessage("");
    const response = await fetch("/api/admin/backup", { method: "POST" });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(payload.error?.message ?? "备份失败");
    setBackups((items) => [{ ...payload.data, createdAt: payload.data.createdAt }, ...items]);
    setMessage("备份已完成并校验");
  }

  return <div className="operations-panel">
    <section><header><div><p className="admin-eyebrow">Recovery export</p><h2>应急名单</h2></div></header><p>只包含编号、姓名、主组、抽奖资格与中奖状态，适合网络中断时离线使用。</p><a className="operation-action" href="/api/admin/export"><Download size={17} />下载应急 CSV</a></section>
    <section><header><div><p className="admin-eyebrow">Database backup</p><h2>数据库备份</h2></div></header><p>正式抽奖模式要求最近 30 分钟内存在成功备份。</p><button className="operation-action" onClick={backup} disabled={pending}>{pending ? <LoaderCircle className="spin" size={17} /> : <DatabaseBackup size={17} />}{pending ? "备份进行中" : "立即备份"}</button>{message ? <span role="status">{message}</span> : null}<div className="backup-list">{backups.map((item) => <div key={item.id}><strong>{new Date(item.createdAt).toLocaleString("zh-CN")}</strong><code>{item.checksum.slice(0, 16)}…</code></div>)}{!backups.length ? <p>尚无备份记录</p> : null}</div></section>
  </div>;
}

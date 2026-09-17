"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Baby, Database, MapPinned, Monitor, Users } from "lucide-react";

import { RegistrationTrend } from "./RegistrationTrend";

type Snapshot = {
  totalGuests: number;
  childCount: number;
  outOfTown: number;
  exceptions: number;
  groups: Array<{ id: string; key: string; name: string; color: string; count: number }>;
  trend: Array<{ minute: string; count: number }>;
  database: "healthy" | "unavailable";
  screenLastSeenAt: string | null;
};

export function OperationsDashboard({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const events = new EventSource("/api/events/admin");
    const refresh = async () => {
      const response = await fetch("/api/admin/dashboard");
      if (response.ok) setSnapshot((await response.json()).data);
    };
    events.onopen = () => setLive(true);
    events.onerror = () => setLive(false);
    ["guest.changed", "grouping.changed", "round.changed", "screen.presence", "health.changed"].forEach((type) => events.addEventListener(type, refresh));
    events.addEventListener("snapshot", (event) => setSnapshot(JSON.parse((event as MessageEvent).data)));
    return () => events.close();
  }, []);

  const maxGroup = Math.max(1, ...snapshot.groups.map((group) => group.count));
  return (
    <div className="operations-dashboard">
      <section className="dashboard-metrics">
        <Metric icon={Users} label="成人宾客" value={snapshot.totalGuests} />
        <Metric icon={Baby} label="同行儿童" value={snapshot.childCount} />
        <Metric icon={MapPinned} label="远道宾客" value={snapshot.outOfTown} />
        <Metric icon={AlertTriangle} label="待处理异常" value={snapshot.exceptions} attention={snapshot.exceptions > 0} />
      </section>
      <section className="dashboard-status-strip">
        <span><i className={snapshot.database === "healthy" ? "dot-on" : "dot-off"} /><Database size={15} />数据库 {snapshot.database === "healthy" ? "正常" : "不可用"}</span>
        <span><i className={live ? "dot-on" : "dot-off"} /><Monitor size={15} />实时通道 {live ? "已连接" : "重连中"}</span>
        <span>投影 {snapshot.screenLastSeenAt ? "最近在线" : "尚未连接"}</span>
      </section>
      <section className="dashboard-grid">
        <div className="dashboard-main-column">
          <div className="dashboard-section">
            <header><div><p className="admin-eyebrow">Distribution</p><h2>主组分布</h2></div><a href="/admin/guests">查看名单</a></header>
            <div className="group-bars">{snapshot.groups.map((group) => <div key={group.id}><span>{group.name}</span><div><i style={{ width: `${(group.count / maxGroup) * 100}%`, background: group.color }} /></div><strong>{group.count}</strong></div>)}</div>
          </div>
          <RegistrationTrend points={snapshot.trend} />
        </div>
        <div className="dashboard-section attention-section">
          <header><div><p className="admin-eyebrow">Attention</p><h2>现场待办</h2></div></header>
          {snapshot.exceptions ? <a href="/admin/guests?exception=true"><AlertTriangle size={18} /><span><strong>{snapshot.exceptions} 位宾客未分组</strong><small>需要人工确认或调整规则</small></span></a> : <p className="all-clear">当前没有未分组宾客</p>}
          <a href="/admin/settings"><span><strong>登记与二维码</strong><small>管理开放状态和大屏照片</small></span></a>
          <a href="/admin/rules"><span><strong>规则版本</strong><small>预览后批量重算</small></span></a>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, attention = false }: { icon: typeof Users; label: string; value: number; attention?: boolean }) {
  const testId = label === "成人宾客" ? "metric-totalGuests" : undefined;
  return <div className={attention ? "metric attention" : "metric"}><Icon size={19} /><span>{label}</span><strong data-testid={testId}>{value}</strong></div>;
}

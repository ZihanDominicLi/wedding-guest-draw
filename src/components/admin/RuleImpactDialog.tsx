"use client";

type Preview = {
  ruleSetId: string;
  beforeCounts: Record<string, number>;
  afterCounts: Record<string, number>;
  changes: Array<{ guestId: string; displayName: string; fromGroupKey: string | null; toGroupKey: string | null }>;
};

export function RuleImpactDialog({ preview, onClose, onApply, applying }: { preview: Preview; onClose: () => void; onApply: () => void; applying: boolean }) {
  const keys = [...new Set([...Object.keys(preview.beforeCounts), ...Object.keys(preview.afterCounts)])];
  return (
    <div className="impact-backdrop" role="presentation">
      <section className="impact-dialog" role="dialog" aria-modal="true" aria-labelledby="impact-title">
        <header><div><p className="admin-eyebrow">Required preview</p><h2 id="impact-title">规则影响预览</h2></div><button type="button" onClick={onClose}>关闭</button></header>
        <div className="impact-counts">{keys.map((key) => <div key={key}><span>{key}</span><strong>{preview.beforeCounts[key] ?? 0} → {preview.afterCounts[key] ?? 0}</strong></div>)}</div>
        <div className="impact-list"><h3>将变更 {preview.changes.length} 位宾客</h3>{preview.changes.slice(0, 50).map((change) => <p key={change.guestId}><strong>{change.displayName}</strong><span>{change.fromGroupKey ?? "未分组"} → {change.toGroupKey ?? "未分组"}</span></p>)}</div>
        <footer><button type="button" onClick={onApply} disabled={applying || !preview}>{applying ? "正在应用" : "确认批量重算"}</button></footer>
      </section>
    </div>
  );
}

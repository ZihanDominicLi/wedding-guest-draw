"use client";

import { useState } from "react";
import { Eye, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { RuleImpactDialog } from "./RuleImpactDialog";

type EditableRule = {
  id: string;
  name: string;
  kind: "PRIMARY" | "TAG";
  enabled: boolean;
  priority: number;
  conditions: unknown;
  targetGroupKey: string | null;
  targetTagKey: string | null;
};

type Preview = Parameters<typeof RuleImpactDialog>[0]["preview"];

export function RuleEditor({ initialRules, groups, tags, version }: { initialRules: EditableRule[]; groups: Array<{ key: string; name: string }>; tags: Array<{ key: string; name: string }>; version: number }) {
  const [rules, setRules] = useState(initialRules);
  const [activeVersion, setActiveVersion] = useState(version);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  function update(index: number, patch: Partial<EditableRule>) {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
    setPreview(null);
  }

  async function save() {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/grouping/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(payload.error?.message ?? "保存失败"); return; }
    setActiveVersion(payload.data.version);
    setMessage(`规则版本 ${payload.data.version} 已保存，请预览后应用`);
  }

  async function runPreview() {
    setPending(true);
    const response = await fetch("/api/admin/grouping/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleSetId: String(activeVersion) }) });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(payload.error?.message ?? "预览失败"); return; }
    setPreview(payload.data);
  }

  async function apply() {
    if (!preview) return;
    setPending(true);
    const response = await fetch("/api/admin/grouping/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleSetId: preview.ruleSetId }) });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) { setMessage(payload.error?.message ?? "应用失败"); return; }
    setMessage(`已重算 ${payload.data.processedCount} 位宾客，变更 ${payload.data.changedCount} 位`);
    setPreview(null);
    router.refresh();
  }

  return (
    <section className="rule-editor">
      <div className="rule-toolbar"><div><strong>版本 {activeVersion}</strong><span>{message}</span></div><div><button type="button" onClick={save} disabled={pending}><Save size={16} />保存新版本</button><button type="button" onClick={runPreview} disabled={pending}><Eye size={16} />预览影响</button></div></div>
      <div className="rule-list">
        {rules.map((rule, index) => (
          <article className="rule-row" key={rule.id}>
            <label className="rule-enabled"><input type="checkbox" checked={rule.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} /><span>{rule.kind === "PRIMARY" ? "主组" : "标签"}</span></label>
            <label><span>规则名称</span><input value={rule.name} onChange={(event) => update(index, { name: event.target.value })} /></label>
            <label><span>优先级</span><input type="number" value={rule.priority} onChange={(event) => update(index, { priority: Number(event.target.value) })} /></label>
            <label><span>目标</span><select value={(rule.kind === "PRIMARY" ? rule.targetGroupKey : rule.targetTagKey) ?? ""} onChange={(event) => update(index, rule.kind === "PRIMARY" ? { targetGroupKey: event.target.value } : { targetTagKey: event.target.value })}>{(rule.kind === "PRIMARY" ? groups : tags).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
            <label className="condition-field"><span>条件 JSON</span><textarea defaultValue={JSON.stringify(rule.conditions)} onBlur={(event) => { try { update(index, { conditions: JSON.parse(event.target.value) }); setMessage(""); } catch { setMessage("条件 JSON 格式有误"); } }} /></label>
          </article>
        ))}
      </div>
      {preview ? <RuleImpactDialog preview={preview} onClose={() => setPreview(null)} onApply={apply} applying={pending} /> : null}
    </section>
  );
}

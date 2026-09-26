"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

type SettingsValue = {
  groomName: string;
  brideName: string;
  weddingDate: string;
  venueProvince: string;
  venueCity: string;
  registrationOpen: boolean;
  formalDrawMode: boolean;
  screenTitle: string;
  screenBackgroundPath: string | null;
};

export function WeddingSettingsForm({ initialValue }: { initialValue: SettingsValue }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        body: new FormData(event.currentTarget),
      });
      if (response.ok) {
        setMessage("设置已保存");
        return;
      }

      const payload = await response.json().catch(() => null) as {
        error?: { message?: string };
      } | null;
      setMessage(payload?.error?.message ?? `保存失败（HTTP ${response.status}）`);
    } catch {
      setMessage("保存失败，请检查网络连接后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <header>
        <p className="admin-eyebrow">Event settings</p>
        <h2>婚礼信息</h2>
      </header>
      <div className="settings-grid">
        <label><span>新郎姓名</span><input name="groomName" defaultValue={initialValue.groomName} /></label>
        <label><span>新娘姓名</span><input name="brideName" defaultValue={initialValue.brideName} /></label>
        <label><span>婚礼日期</span><input name="weddingDate" type="date" defaultValue={initialValue.weddingDate} /></label>
        <label><span>大屏标题</span><input name="screenTitle" defaultValue={initialValue.screenTitle} required /></label>
        <label><span>举办省份</span><input name="venueProvince" defaultValue={initialValue.venueProvince} /></label>
        <label><span>举办城市</span><input name="venueCity" defaultValue={initialValue.venueCity} /></label>
      </div>
      <label className="background-upload">
        <span>大屏背景照片</span>
        <input name="background" type="file" accept="image/jpeg,image/png,image/webp" />
        <small>{initialValue.screenBackgroundPath ? "已上传背景，可选择新文件替换（JPEG、PNG、WebP，最大 25 MiB）" : "支持 JPEG、PNG、WebP，最大 25 MiB"}</small>
      </label>
      <label className="settings-toggle">
        <input name="registrationOpen" type="checkbox" defaultChecked={initialValue.registrationOpen} />
        <span><strong>开放现场登记</strong><small>关闭后扫码页面只显示暂停提示</small></span>
      </label>
      <label className="settings-toggle">
        <input name="formalDrawMode" type="checkbox" defaultChecked={initialValue.formalDrawMode} />
        <span><strong>正式抽奖模式</strong><small>锁定候选前必须有 30 分钟内的数据库备份</small></span>
      </label>
      <footer>
        <button type="submit" disabled={pending}>
          {pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
          {pending ? "正在保存" : "保存设置"}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </footer>
    </form>
  );
}

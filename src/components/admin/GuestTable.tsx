import { Lock, TriangleAlert } from "lucide-react";

import { GuestEditor } from "./GuestEditor";

type GuestRow = {
  id: string;
  attendanceNumber: number;
  name: string;
  relation: string;
  childCount: number;
  originProvince: string;
  originCity: string;
  primaryGroupId: string | null;
  primaryGroup: { name: string } | null;
  tags: Array<{ tag: { id: string; name: string; color: string } }>;
  groupLocked: boolean;
  enabled: boolean;
  checkedInAt: string;
  quizScore: number | null;
  quizCompletedAt: string | null;
};

export function GuestTable({ items, groups }: { items: GuestRow[]; groups: Array<{ id: string; name: string }> }) {
  if (!items.length) return <div className="empty-table">没有符合条件的宾客</div>;

  return (
    <div className="table-scroll">
      <table className="guest-table">
        <thead><tr><th>编号</th><th>宾客</th><th>关系</th><th>来源</th><th>主组 / 标签</th><th>答题</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead>
        <tbody>
          {items.map((guest) => (
            <tr key={guest.id}>
              <td>#{String(guest.attendanceNumber).padStart(3, "0")}</td>
              <td><strong>{guest.name}</strong><small>{guest.childCount ? `携带 ${guest.childCount} 位小朋友` : "成人宾客"}</small></td>
              <td>{relationLabel(guest.relation)}</td>
              <td>{guest.originProvince} · {guest.originCity}</td>
              <td>
                <span className={guest.primaryGroup ? "group-label" : "group-label warning"}>
                  {guest.primaryGroup?.name ?? <><TriangleAlert size={13} />未分组</>}
                </span>
                <div className="tag-line">{guest.tags.map(({ tag }) => <i key={tag.id} style={{ borderColor: tag.color }}>{tag.name}</i>)}</div>
              </td>
              <td>{guest.quizCompletedAt ? <><strong>{guest.quizScore ?? 0} / 10</strong><small>已完成</small></> : <small>未完成</small>}</td>
              <td><span className={guest.enabled ? "status-on" : "status-off"}>{guest.enabled ? "可抽奖" : "已禁用"}</span>{guest.groupLocked ? <Lock size={14} aria-label="已锁组" /> : null}</td>
              <td><GuestEditor guest={guest} groups={groups} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function relationLabel(value: string) {
  return ({ GROOM_RELATIVE: "男方亲属", BRIDE_RELATIVE: "女方亲属", GROOM_FRIEND: "男方朋友", BRIDE_FRIEND: "女方朋友", MUTUAL_FRIEND: "共同朋友", COLLEAGUE: "同事", CLASSMATE: "同学", OTHER: "其他" } as Record<string, string>)[value] ?? value;
}

type ExportGuest = {
  attendanceNumber: number;
  name: string;
  relation: string;
  childCount: number;
  originProvince: string;
  originCity: string;
  enabled: boolean;
  primaryGroup: { name: string } | null;
  tags: Array<{ tag: { name: string } }>;
  createdAt: Date;
  updatedAt: Date;
};

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildGuestCsv(guests: ExportGuest[]): string {
  const rows = [
    ["现场编号", "姓名", "关系", "儿童人数", "出发省份", "出发城市", "主组", "标签", "抽奖资格", "登记时间", "更新时间"],
    ...guests.map((guest) => [
      guest.attendanceNumber,
      guest.name,
      guest.relation,
      guest.childCount,
      guest.originProvince,
      guest.originCity,
      guest.primaryGroup?.name ?? "未分组",
      guest.tags.map(({ tag }) => tag.name).join("、"),
      guest.enabled && guest.primaryGroup ? "可参与" : "不可参与",
      guest.createdAt.toISOString(),
      guest.updatedAt.toISOString(),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

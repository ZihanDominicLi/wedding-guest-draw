type EmergencyGuest = {
  id: string;
  name: string;
  enabled: boolean;
  primaryGroup: { name: string } | null;
  winners: Array<{ status: string }>;
};

function cell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildEmergencyCsv<T extends EmergencyGuest>(guests: readonly T[]) {
  const rows = guests.map((guest) => {
    const activeWinner = guest.winners.find((winner) =>
      ["RESERVED", "PUBLISHED"].includes(winner.status),
    );
    return [
      guest.id,
      guest.name,
      guest.primaryGroup?.name ?? "未分组",
      guest.enabled && guest.primaryGroup && !activeWinner ? "是" : "否",
      activeWinner?.status ?? "未中奖",
    ].map((value) => cell(String(value))).join(",");
  });
  return `\uFEFF宾客ID,姓名,主组,可参与抽奖,中奖状态\r\n${rows.join("\r\n")}`;
}

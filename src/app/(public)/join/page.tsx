import { db } from "@/lib/db";
import { RegistrationWizard } from "@/components/join/RegistrationWizard";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const settings = await db.weddingSettings.findUnique({ where: { id: "default" } });
  const names = [settings?.groomName, settings?.brideName].filter(Boolean);
  const coupleLabel = names.length ? names.join(" & ") : "我们的婚礼";

  return (
    <main className="join-shell">
      <RegistrationWizard
        coupleLabel={coupleLabel}
        registrationOpen={settings?.registrationOpen ?? false}
      />
      <p className="privacy-note">信息仅用于现场签到、分组与抽奖</p>
    </main>
  );
}

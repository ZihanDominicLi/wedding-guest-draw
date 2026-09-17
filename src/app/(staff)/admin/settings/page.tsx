import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { QrDownload } from "@/components/admin/QrDownload";
import { WeddingSettingsForm } from "@/components/admin/WeddingSettingsForm";
import { requireAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canonicalJoinUrl } from "@/modules/settings/url";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  try {
    await requireAdmin(await headers());
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const settings = await db.weddingSettings.findUniqueOrThrow({
    where: { id: "default" },
  });

  return (
    <main className="settings-shell">
      <header className="admin-page-header">
        <div><p>现场指挥台</p><h1>婚礼与登记设置</h1></div>
        <a href="/admin">返回概览</a>
      </header>
      <WeddingSettingsForm
        initialValue={{
          groomName: settings.groomName,
          brideName: settings.brideName,
          weddingDate: settings.weddingDate?.toISOString().slice(0, 10) ?? "",
          venueProvince: settings.venueProvince,
          venueCity: settings.venueCity,
          registrationOpen: settings.registrationOpen,
          formalDrawMode: settings.formalDrawMode,
          screenTitle: settings.screenTitle,
          screenBackgroundPath: settings.screenBackgroundPath,
        }}
      />
      <QrDownload value={canonicalJoinUrl(env.BETTER_AUTH_URL)} />
    </main>
  );
}

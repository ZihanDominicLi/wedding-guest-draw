import { ProjectorScene } from "@/components/draw/ProjectorScene";
import type { ScreenSnapshot } from "@/components/draw/projector-state";
import { getScreenSnapshot } from "@/modules/live/snapshot";

export const dynamic = "force-dynamic";

export default async function ScreenPage() {
  const snapshot = await getScreenSnapshot();
  return <ProjectorScene initialSnapshot={snapshot as ScreenSnapshot} />;
}

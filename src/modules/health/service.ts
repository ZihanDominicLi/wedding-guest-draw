import { db } from "@/lib/db";

export async function getHealth() {
  const startedAt = performance.now();
  await db.$queryRaw`SELECT 1`;
  return {
    status: "ok" as const,
    database: "healthy" as const,
    latencyMs: Math.round(performance.now() - startedAt),
    checkedAt: new Date().toISOString(),
  };
}

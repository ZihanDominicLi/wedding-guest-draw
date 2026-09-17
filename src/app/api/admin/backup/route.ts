import { FreshAuthenticationRequiredError, requireFreshAdmin, UnauthorizedError } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, problem } from "@/lib/http";
import { runBackup } from "@/modules/backup/service";

export async function GET(request: Request) {
  try {
    await requireFreshAdmin(request.headers);
    return ok(await db.backupRecord.findMany({ orderBy: { createdAt: "desc" }, take: 20 }));
  } catch (error) {
    if (error instanceof FreshAuthenticationRequiredError) return problem(401, "FRESH_AUTH_REQUIRED", "请重新登录后查看备份");
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const administrator = await requireFreshAdmin(request.headers);
    const record = await runBackup();
    await db.auditEvent.create({ data: { actorId: administrator.id, action: "backup.completed", entityType: "BackupRecord", entityId: record.id, afterJson: { checksum: record.checksum } } });
    return ok(record, { status: 201 });
  } catch (error) {
    if (error instanceof FreshAuthenticationRequiredError) return problem(401, "FRESH_AUTH_REQUIRED", "请重新登录后执行备份");
    if (error instanceof UnauthorizedError) return problem(401, "UNAUTHORIZED", "需要管理员登录");
    if (error instanceof Error && error.message === "BACKUP_COMMAND_FAILED") return problem(500, "BACKUP_FAILED", "备份命令执行失败，请检查 PostgreSQL 工具");
    throw error;
  }
}

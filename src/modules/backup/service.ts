import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

const execute = promisify(execFile);

export async function hasFreshBackup(maxAgeMinutes = 30) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  return Boolean(await db.backupRecord.findFirst({ where: { createdAt: { gte: cutoff } }, orderBy: { createdAt: "desc" }, select: { id: true } }));
}

async function uploadManifest(directory: string) {
  const files = await readdir(directory).catch(() => [] as string[]);
  return Promise.all(files.map(async (name) => {
    const details = await stat(path.join(directory, name));
    return { name, size: details.size, modifiedAt: details.mtime.toISOString() };
  }));
}

export async function runBackup({ overrideReason }: { overrideReason?: string } = {}) {
  const backupDirectory = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
  const uploadsDirectory = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const dumpPath = path.join(backupDirectory, `wedding-${stamp}.dump`);
  try {
    await execute("pg_dump", ["--dbname", env.DATABASE_URL, "--format=custom", "--file", dumpPath], { timeout: 120_000 });
  } catch {
    throw new Error("BACKUP_COMMAND_FAILED");
  }
  const checksum = createHash("sha256").update(await readFile(dumpPath)).digest("hex");
  const uploads = await uploadManifest(uploadsDirectory);
  const metadata = { dumpPath, checksum, uploads, createdAt: new Date().toISOString() };
  await writeFile(`${dumpPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return db.backupRecord.create({ data: { path: dumpPath, checksum, uploadsJson: uploads, overrideReason } });
}

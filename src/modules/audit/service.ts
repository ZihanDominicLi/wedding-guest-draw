import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { redactAuditPayload } from "./redact";

type AuditInput = {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(redactAuditPayload(value))) as Prisma.InputJsonValue;
}

export function appendAudit(input: AuditInput) {
  return db.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: json(input.before),
      afterJson: json(input.after),
      reason: input.reason,
    },
  });
}

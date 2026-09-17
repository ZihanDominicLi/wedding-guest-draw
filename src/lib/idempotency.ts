import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Transaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class InvalidIdempotencyKeyError extends Error {
  constructor() {
    super("A valid idempotency key is required");
    this.name = "InvalidIdempotencyKeyError";
  }
}

export async function withTransactionIdempotency<T>(
  transaction: Transaction,
  scope: string,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!key || key.length > 160) throw new InvalidIdempotencyKeyError();
  const replay = await transaction.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
  if (replay?.responseJson) return replay.responseJson as T;
  const result = await operation();
  await transaction.idempotencyRecord.create({
    data: {
      scope,
      key,
      responseJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      statusCode: 200,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return result;
}

export function withIdempotency<T>(
  scope: string,
  key: string,
  operation: (transaction: Transaction) => Promise<T>,
) {
  return db.$transaction(
    (transaction) => withTransactionIdempotency(transaction, scope, key, () => operation(transaction)),
    { isolationLevel: "Serializable" },
  );
}

"use client";

export type PendingAnswer = {
  eventId: string;
  participantId: string;
  questionId: string;
  submissionId: string;
  optionIndex: number;
  retryCount?: number;
  createdAt?: number;
};

export type QueueFlushResult = { sent: number; removed: number; failed: number };

type StoredAnswer = PendingAnswer & { id: string; retryCount: number; createdAt: number };

const DATABASE_NAME = "wedding-quiz-answer-queue";
const STORE_NAME = "answers";
const memoryQueue = new Map<string, StoredAnswer>();
let flushInFlight: Promise<QueueFlushResult> | null = null;

function keyOf(item: Pick<PendingAnswer, "eventId" | "participantId" | "questionId" | "submissionId">): string {
  return [item.eventId, item.participantId, item.questionId, item.submissionId].join(":");
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open answer queue"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = work(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Answer queue operation failed"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Answer queue transaction failed"));
  });
}

export async function enqueueAnswer(input: PendingAnswer): Promise<void> {
  const item: StoredAnswer = {
    ...input,
    id: keyOf(input),
    retryCount: input.retryCount ?? 0,
    createdAt: input.createdAt ?? Date.now(),
  };
  if (!hasIndexedDb()) {
    memoryQueue.set(item.id, item);
    return;
  }
  await withStore("readwrite", (store) => store.put(item));
}

export async function listPendingAnswers(): Promise<StoredAnswer[]> {
  if (!hasIndexedDb()) return [...memoryQueue.values()].sort((a, b) => a.createdAt - b.createdAt);
  const records = await withStore<StoredAnswer[]>("readonly", (store) => store.getAll());
  return records.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeAnswer(eventId: string, participantId: string, questionId: string, submissionId: string): Promise<void> {
  const id = keyOf({ eventId, participantId, questionId, submissionId });
  if (!hasIndexedDb()) {
    memoryQueue.delete(id);
    return;
  }
  await withStore("readwrite", (store) => store.delete(id));
}

async function incrementRetry(item: StoredAnswer): Promise<void> {
  const updated = { ...item, retryCount: item.retryCount + 1 };
  if (!hasIndexedDb()) {
    memoryQueue.set(item.id, updated);
    return;
  }
  await withStore("readwrite", (store) => store.put(updated));
}

export function flushAnswerQueue(
  send: (item: StoredAnswer) => Promise<void>,
  scope?: Pick<PendingAnswer, "eventId" | "participantId">,
): Promise<QueueFlushResult> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushPendingAnswers(send, scope).finally(() => { flushInFlight = null; });
  return flushInFlight;
}

async function flushPendingAnswers(
  send: (item: StoredAnswer) => Promise<void>,
  scope?: Pick<PendingAnswer, "eventId" | "participantId">,
): Promise<QueueFlushResult> {
  const pending = (await listPendingAnswers()).filter((item) =>
    (!scope || item.eventId === scope.eventId && item.participantId === scope.participantId));
  const result: QueueFlushResult = { sent: 0, removed: 0, failed: 0 };
  for (const item of pending) {
    try {
      await send(item);
      result.sent += 1;
      await removeAnswer(item.eventId, item.participantId, item.questionId, item.submissionId);
      result.removed += 1;
    } catch {
      result.failed += 1;
      await incrementRetry(item);
    }
  }
  return result;
}

export async function clearAnswerQueueForTests(): Promise<void> {
  memoryQueue.clear();
  if (!hasIndexedDb()) return;
  await withStore("readwrite", (store) => store.clear());
}

import { z } from "zod";

export const REGISTRATION_DRAFT_KEY = "wedding-registration-draft:v1";

const draftSchema = z.object({
  step: z.number().int().min(1).max(3),
  name: z.string(),
  phoneLast4: z.string(),
  relation: z.string(),
  childCount: z.number().int().min(0).max(20),
  originProvince: z.string(),
  originCity: z.string(),
  idempotencyKey: z.string().min(8),
});

export type RegistrationDraft = z.infer<typeof draftSchema>;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): DraftStorage {
  return window.localStorage;
}

export function loadRegistrationDraft(
  storage: DraftStorage = browserStorage(),
): RegistrationDraft | null {
  try {
    const value = storage.getItem(REGISTRATION_DRAFT_KEY);
    if (!value) return null;
    const parsed = draftSchema.safeParse(JSON.parse(value));
    if (parsed.success) return parsed.data;
  } catch {
    // A malformed browser draft is safe to discard.
  }

  storage.removeItem(REGISTRATION_DRAFT_KEY);
  return null;
}

export function saveRegistrationDraft(
  draft: RegistrationDraft,
  storage: DraftStorage = browserStorage(),
): void {
  storage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
}

export function clearRegistrationDraft(
  storage: DraftStorage = browserStorage(),
): void {
  storage.removeItem(REGISTRATION_DRAFT_KEY);
}

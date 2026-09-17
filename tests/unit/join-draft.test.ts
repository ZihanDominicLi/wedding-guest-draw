// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "@/components/join/draft";

describe("registration draft", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  beforeEach(() => values.clear());

  it("restores a valid saved draft", () => {
    saveRegistrationDraft({
      step: 2,
      name: "林嘉",
      phoneLast4: "8080",
      relation: "BRIDE_FRIEND",
      childCount: 1,
      originProvince: "上海",
      originCity: "上海市",
      idempotencyKey: "draft-key-123456",
    }, storage);

    expect(loadRegistrationDraft(storage)).toMatchObject({
      step: 2,
      name: "林嘉",
      childCount: 1,
      idempotencyKey: "draft-key-123456",
    });
  });

  it("discards malformed browser data", () => {
    storage.setItem("wedding-registration-draft:v1", "not-json");

    expect(loadRegistrationDraft(storage)).toBeNull();
    expect(storage.getItem("wedding-registration-draft:v1")).toBeNull();
  });

  it("clears the draft only after a successful submission", () => {
    saveRegistrationDraft({
      step: 1,
      name: "林嘉",
      phoneLast4: "8080",
      relation: "BRIDE_FRIEND",
      childCount: 0,
      originProvince: "",
      originCity: "",
      idempotencyKey: "draft-key-123456",
    }, storage);

    clearRegistrationDraft(storage);

    expect(loadRegistrationDraft(storage)).toBeNull();
  });
});

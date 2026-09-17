const SENSITIVE_KEYS = new Set([
  "phoneLast4",
  "phone",
  "deviceHash",
  "password",
  "passwordHash",
  "session",
  "sessionToken",
  "token",
  "originProvince",
  "originCity",
  "childCount",
]);

export function redactAuditPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key))
      .map(([key, nested]) => [key, redactAuditPayload(nested)]),
  );
}

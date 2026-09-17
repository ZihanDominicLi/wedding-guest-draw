const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class CrossOriginRequestError extends Error {
  constructor() {
    super("Cross-origin mutation rejected");
    this.name = "CrossOriginRequestError";
  }
}

export function assertSameOrigin(request: Request) {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expectedOrigin = new URL(
    process.env.BETTER_AUTH_URL ?? request.url,
  ).origin;
  if (new URL(origin).origin !== expectedOrigin) {
    throw new CrossOriginRequestError();
  }
}

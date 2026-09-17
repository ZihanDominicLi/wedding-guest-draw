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
  if (new URL(origin).origin !== new URL(request.url).origin) {
    throw new CrossOriginRequestError();
  }
}

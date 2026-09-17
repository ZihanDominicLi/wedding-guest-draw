type ProblemPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data }, init);
}

export function problem(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const payload: ProblemPayload = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };

  return Response.json(payload, { status });
}

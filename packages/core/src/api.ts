export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function readApiResponse<T = unknown>(
  response: Response,
): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  > & {
    code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      payload.message || "The request could not be completed.",
      response.status,
      payload.code,
      payload,
    );
  }
  return payload as T;
}

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export const REQUEST_TIMEOUT_MS = 10_000;

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const declaresJson = init.body !== undefined || !BODYLESS_METHODS.has(method);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      credentials: "include",
      headers: {
        ...(declaresJson ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    const late = cause instanceof DOMException && cause.name === "TimeoutError";
    throw new ApiError(
      late ? "No answer in time. Try again." : "No connection. Try again.",
      0,
      late ? "timeout" : "offline",
    );
  }
  return readApiResponse<T>(response);
}

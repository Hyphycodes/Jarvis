/**
 * Tiny HTTP helper used by every source adapter.
 *
 * - Native fetch.
 * - Typed ApiError with service / status / message / cause.
 * - Timeout via AbortController.
 * - Safe retry for GET (idempotent only). Non-GET requests do not retry.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type FetchJsonOptions = {
  service: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly service: string,
    readonly status: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static is(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAY_MS = 350;

export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions,
): Promise<T> {
  const method = options.method ?? "GET";
  const retries = method === "GET" ? (options.retries ?? 1) : 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseDelay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const fullUrl = appendQuery(url, options.query);

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(fullUrl, {
        method,
        headers: buildHeaders(options.headers, options.body),
        body:
          options.body == null
            ? undefined
            : typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await safeText(response);
        const err = new ApiError(
          `${options.service} ${method} ${response.status}: ${truncate(text)}`,
          options.service,
          response.status,
          text,
        );
        if (
          attempt < retries &&
          method === "GET" &&
          shouldRetryStatus(response.status)
        ) {
          lastError = err;
          await sleep(baseDelay * (attempt + 1));
          continue;
        }
        throw err;
      }

      if (response.status === 204) return undefined as T;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        return text as unknown as T;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (ApiError.is(error)) {
        if (attempt >= retries) throw error;
        lastError = error;
        await sleep(baseDelay * (attempt + 1));
        continue;
      }
      if (isAbortError(error)) {
        const err = new ApiError(
          `${options.service} ${method} timed out after ${timeoutMs}ms`,
          options.service,
          408,
          error,
        );
        if (attempt >= retries) throw err;
        lastError = err;
        await sleep(baseDelay * (attempt + 1));
        continue;
      }
      const err = new ApiError(
        `${options.service} ${method} failed: ${(error as Error)?.message ?? "unknown"}`,
        options.service,
        0,
        error,
      );
      if (attempt >= retries) throw err;
      lastError = err;
      await sleep(baseDelay * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable if retries logic is correct; rethrow last error for safety.
  throw lastError ?? new ApiError("unknown error", options.service, 0);
}

function buildHeaders(
  extra?: Record<string, string>,
  body?: unknown,
): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body != null && typeof body !== "string") {
    headers["content-type"] = "application/json";
  }
  if (extra) Object.assign(headers, extra);
  return headers;
}

function appendQuery(
  url: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return url;
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    usp.append(key, String(value));
  }
  const qs = usp.toString();
  if (!qs) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function truncate(value: string): string {
  if (value.length <= 240) return value;
  return `${value.slice(0, 240)}…`;
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(value: unknown): boolean {
  return (
    value instanceof DOMException && value.name === "AbortError"
  ) || (value instanceof Error && value.name === "AbortError");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

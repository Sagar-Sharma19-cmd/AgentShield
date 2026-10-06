import type { ErrorResponse } from "@/types/api";

/**
 * Thrown for any non-2xx response. Carries the parsed ErrorResponse body when the backend
 * returned one (it always does for 4xx/5xx — see com.agentshield.config.GlobalExceptionHandler).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorResponse | null;

  constructor(status: number, body: ErrorResponse | null) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type AuthMode =
  | { kind: "admin"; key: string }
  | { kind: "agent"; key: string }
  | { kind: "none" };

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth: AuthMode;
  searchParams?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, searchParams?: RequestOptions["searchParams"]): string {
  const url = new URL(`/api/v1${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.pathname + (url.search ?? "");
}

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};

  if (options.auth.kind === "admin") {
    headers["X-Admin-API-Key"] = options.auth.key;
  } else if (options.auth.kind === "agent") {
    headers["X-Agent-API-Key"] = options.auth.key;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(path, options.searchParams), {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload as ErrorResponse | null);
  }

  return payload as T;
}

import { NextResponse } from "next/server";
import type { ApiError } from "./types";

export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  status = 500,
): ApiError {
  return { code, message, details, status };
}

const SECRET_KEYS = new Set([
  "githubtoken",
  "llmapikey",
  "apikey",
  "authorization",
  "token",
  "secret",
  "password",
]);

export function redactSecrets(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSecrets);

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = SECRET_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redactSecrets(v);
  }
  return result;
}

export function jsonError(
  error: unknown,
  fallbackCode: string,
  fallbackStatus: number,
): NextResponse {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    "status" in error
  ) {
    const e = error as ApiError;
    return NextResponse.json(
      { code: e.code, message: e.message, details: redactSecrets(e.details) },
      { status: e.status },
    );
  }
  return NextResponse.json(
    { code: fallbackCode, message: "[Internal error]" },
    { status: fallbackStatus },
  );
}

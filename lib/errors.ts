import { NextResponse } from "next/server";
import type { ApiError } from "./types";

const REDACTED = "[REDACTED]";
const SECRET_KEY_PATTERN = /(authorization|api[-_]?key|token|secret|password)/i;
const TOKEN_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]+/g,
  /github_pat_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]+/g,
  /(authorization\s*[:=]\s*)(bearer|token|basic)\s+[^\s,;]+/gi,
  /((?:api[-_]?key|token|secret|password)\s*[:=]\s*)["']?[^"',\s}]+/gi,
];

export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  status?: number,
): ApiError {
  return {
    code,
    message,
    ...(details === undefined ? {} : { details }),
    ...(status === undefined ? {} : { status }),
  };
}

export function redactSecrets(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

export function jsonError(error: unknown, fallbackCode: string, fallbackStatus: number) {
  const apiError = normalizeApiError(error, fallbackCode, fallbackStatus);
  const bodyError: ApiError = {
    code: apiError.code,
    message: redactString(apiError.message),
    ...(apiError.details === undefined ? {} : { details: redactSecrets(apiError.details) as Record<string, unknown> }),
  };

  return NextResponse.json({ error: bodyError }, { status: apiError.status ?? fallbackStatus });
}

function normalizeApiError(error: unknown, fallbackCode: string, fallbackStatus: number): ApiError {
  if (isApiError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return createApiError(fallbackCode, error.message, undefined, fallbackStatus);
  }

  return createApiError(fallbackCode, "Unexpected error", { cause: redactSecrets(error) }, fallbackStatus);
}

function isApiError(error: unknown): error is ApiError {
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    (error.details === undefined || isRecord(error.details)) &&
    (error.status === undefined || typeof error.status === "number")
  );
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const redactedArray = value.map((item) => redactValue(item, seen));
    seen.delete(value);
    return redactedArray;
  }

  if (value instanceof Error) {
    const redactedError = {
      name: value.name,
      message: redactString(value.message),
    };
    seen.delete(value);
    return redactedError;
  }

  const redactedObject = Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? REDACTED : redactValue(entryValue, seen),
    ]),
  );
  seen.delete(value);
  return redactedObject;
}

function redactString(value: string): string {
  return TOKEN_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, (match, prefix) => {
    if (typeof prefix === "string" && match.toLowerCase().startsWith(prefix.toLowerCase())) {
      return `${prefix}${REDACTED}`;
    }
    return REDACTED;
  }), value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

import { ApiError } from "./types";

export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  status?: number
): ApiError {
  return {
    code,
    message,
    details,
    status,
  };
}

export function redactSecrets(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    let redacted = value;
    redacted = redacted.replace(/ghp_[A-Za-z0-9_]+/g, "[REDACTED]");
    redacted = redacted.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
    return redacted;
  }
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (typeof value === "object") {
    const redactedObj: Record<string, any> = {};
    const secretKeys = ["githubtoken", "llmapikey", "apikey", "authorization", "token", "password", "secret"];
    for (const key of Object.keys(value)) {
      const lowerKey = key.toLowerCase();
      if (secretKeys.includes(lowerKey)) {
        redactedObj[key] = "[REDACTED]";
      } else {
        redactedObj[key] = redactSecrets(value[key]);
      }
    }
    return redactedObj;
  }
  return value;
}

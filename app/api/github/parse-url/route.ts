import { createApiError, jsonError } from "../../../../lib/errors";
import { parseGitHubUrl } from "../../../../lib/url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.url !== "string" || body.url.trim() === "") {
      throw createApiError("INVALID_GITHUB_URL", "Request body must include a GitHub URL string", undefined, 400);
    }

    return Response.json(parseRequestUrl(body.url));
  } catch (error) {
    return jsonError(error, "INVALID_GITHUB_URL", 400);
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createApiError("INVALID_GITHUB_URL", "Request body must be valid JSON", undefined, 400);
  }
}

function parseRequestUrl(rawUrl: string) {
  try {
    return parseGitHubUrl(rawUrl);
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported GitHub URL") {
      throw createApiError("UNSUPPORTED_GITHUB_URL", "Unsupported GitHub URL", undefined, 400);
    }

    throw createApiError(
      "INVALID_GITHUB_URL",
      error instanceof Error ? error.message : "Invalid GitHub URL",
      undefined,
      400,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

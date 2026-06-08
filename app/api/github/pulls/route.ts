import { createApiError, jsonError } from "../../../../lib/errors";
import { GitHubClient } from "../../../../lib/github";

export const dynamic = "force-dynamic";

// Token expectations: public repositories can be read without a token or with
// readable contents/pull request access. Private repositories need equivalent
// access. Classic tokens are `public_repo` for public-only and `repo` for private.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (!isRecord(body) || !isNonEmptyString(body.owner) || !isNonEmptyString(body.repo)) {
      throw createApiError("GITHUB_REQUEST_INVALID", "Request body must include owner and repo strings", undefined, 400);
    }

    const client = new GitHubClient(readOptionalString(body.githubToken));
    const pulls = await client.listOpenPulls(body.owner, body.repo);

    return Response.json({ pulls });
  } catch (error) {
    return jsonError(error, "GITHUB_API_ERROR", 500);
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createApiError("GITHUB_REQUEST_INVALID", "Request body must be valid JSON", undefined, 400);
  }
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

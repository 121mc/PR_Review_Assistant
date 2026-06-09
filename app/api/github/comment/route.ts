import { createApiError, jsonError } from "../../../../lib/errors";
import { GitHubClient } from "../../../../lib/github";

export const dynamic = "force-dynamic";

// Token expectations: publishing requires issue comment write permission plus
// readable contents/pull request access. Private repositories need equivalent
// access. Classic tokens are `public_repo` for public-only and `repo` for private.
// Duplicate comment protection is handled by the frontend in version one.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (
      !isRecord(body) ||
      !isNonEmptyString(body.owner) ||
      !isNonEmptyString(body.repo) ||
      !isPositiveInteger(body.pullNumber)
    ) {
      throw createApiError(
        "GITHUB_REQUEST_INVALID",
        "Request body must include owner, repo, and pullNumber",
        undefined,
        400,
      );
    }
    if (!isNonEmptyString(body.body)) {
      throw createApiError("COMMENT_BODY_EMPTY", "Comment body must not be empty", undefined, 400);
    }
    const githubToken = readOptionalString(body.githubToken);
    if (githubToken.trim() === "") {
      throw createApiError("GITHUB_UNAUTHORIZED", "GitHub token is required to publish comments", undefined, 401);
    }

    const client = new GitHubClient(githubToken);
    const result = await client.createPullComment(body.owner, body.repo, body.pullNumber, body.body);

    return Response.json(result);
  } catch (error) {
    return jsonError(error, "COMMENT_PUBLISH_FAILED", 500);
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

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

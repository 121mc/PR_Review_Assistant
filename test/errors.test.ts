import { describe, expect, it } from "vitest";
import { createApiError, jsonError, redactSecrets } from "../lib/errors";

describe("api errors", () => {
  it("creates structured api errors", () => {
    expect(createApiError("GITHUB_UNAUTHORIZED", "Bad token", { route: "/x" }, 401)).toMatchObject({
      code: "GITHUB_UNAUTHORIZED",
      message: "Bad token",
      details: { route: "/x" },
      status: 401,
    });
  });

  it("redacts common secret fields", () => {
    expect(
      redactSecrets({
        githubToken: "ghp_secret",
        llmApiKey: "sk-secret",
        headers: { authorization: "Bearer abc" },
      }),
    ).toEqual({
      githubToken: "[REDACTED]",
      llmApiKey: "[REDACTED]",
      headers: { authorization: "[REDACTED]" },
    });
  });

  it("builds redacted json api error responses", async () => {
    const response = jsonError(
      createApiError("LLM_UNAUTHORIZED", "Rejected", { apiKey: "sk-secret" }, 401),
      "FALLBACK",
      500,
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "LLM_UNAUTHORIZED",
        message: "Rejected",
        details: { apiKey: "[REDACTED]" },
      },
    });
    expect(response.status).toBe(401);
  });
});

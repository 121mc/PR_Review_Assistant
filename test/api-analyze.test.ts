import { beforeEach, describe, expect, it, vi } from "vitest";
import { dynamic, POST as analyzePullRequest } from "../app/api/analyze/route";
import { createApiError } from "../lib/errors";
import type { AnalysisContext } from "../lib/types";
import { validReport } from "./fixtures/report";

const githubMocks = vi.hoisted(() => ({
  GitHubClient: vi.fn(),
}));

const contextMocks = vi.hoisted(() => ({
  collectAnalysisContext: vi.fn(),
}));

const llmMocks = vi.hoisted(() => ({
  analyzeWithLlm: vi.fn(),
}));

vi.mock("../lib/github", () => ({
  GitHubClient: githubMocks.GitHubClient,
}));

vi.mock("../lib/context", () => ({
  collectAnalysisContext: contextMocks.collectAnalysisContext,
}));

vi.mock("../lib/llm", () => ({
  analyzeWithLlm: llmMocks.analyzeWithLlm,
}));

const analysisContext: AnalysisContext = {
  repository: {
    owner: "octo",
    repo: "repo",
    url: "https://github.com/octo/repo",
  },
  pullRequest: {
    summary: {
      owner: "octo",
      repo: "repo",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "open",
      baseRef: "main",
      headRef: "fix",
      updatedAt: "2026-06-08T00:00:00Z",
      url: "https://github.com/octo/repo/pull/42",
    },
    body: "Fixes a bug",
    additions: 3,
    deletions: 1,
    changedFiles: 1,
    mergeable: true,
    draft: false,
  },
  changedFiles: [],
  contextFiles: [],
  detectedLanguages: ["TypeScript"],
  truncated: false,
  truncationNotes: [],
};

beforeEach(() => {
  const githubClient = {};

  githubMocks.GitHubClient.mockClear();
  githubMocks.GitHubClient.mockImplementation(function GitHubClientMock() {
    return githubClient;
  });
  contextMocks.collectAnalysisContext.mockReset();
  contextMocks.collectAnalysisContext.mockResolvedValue(analysisContext);
  llmMocks.analyzeWithLlm.mockReset();
  llmMocks.analyzeWithLlm.mockResolvedValue(validReport);
});

describe("analyze API route", () => {
  it("exports force-dynamic route config", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns the validated analysis report", async () => {
    const response = await analyzePullRequest(
      jsonRequest({
        owner: "octo",
        repo: "repo",
        pullNumber: 42,
        githubToken: "ghp_test",
        llm: {
          baseUrl: "https://llm.example/v1",
          apiKey: "sk_test",
          model: "reviewer",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ report: validReport });
  });

  it("returns CONFIG_MISSING for missing required config", async () => {
    const response = await analyzePullRequest(
      jsonRequest({
        owner: "octo",
        repo: "repo",
        pullNumber: 42,
        githubToken: "ghp_test",
        llm: {
          baseUrl: "https://llm.example/v1",
          apiKey: "sk_test",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "CONFIG_MISSING" });
    expect(githubMocks.GitHubClient).not.toHaveBeenCalled();
    expect(contextMocks.collectAnalysisContext).not.toHaveBeenCalled();
    expect(llmMocks.analyzeWithLlm).not.toHaveBeenCalled();
  });

  it("returns a field-specific error for an invalid LLM base URL", async () => {
    const response = await analyzePullRequest(
      jsonRequest({
        owner: "octo",
        repo: "repo",
        pullNumber: 42,
        githubToken: "ghp_test",
        llm: {
          baseUrl: "not a url",
          apiKey: "sk_test",
          model: "reviewer",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFIG_INVALID",
      message: "LLM Base URL must be a valid HTTP(S) URL.",
      details: { invalid: ["llm.baseUrl"] },
    });
    expect(githubMocks.GitHubClient).not.toHaveBeenCalled();
    expect(contextMocks.collectAnalysisContext).not.toHaveBeenCalled();
    expect(llmMocks.analyzeWithLlm).not.toHaveBeenCalled();
  });

  it("passes the GitHub client and collected context through the orchestration path", async () => {
    const response = await analyzePullRequest(
      jsonRequest({
        owner: "octo",
        repo: "repo",
        pullNumber: 42,
        githubToken: "ghp_test",
        llm: {
          baseUrl: "https://llm.example/v1",
          apiKey: "sk_test",
          model: "reviewer",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(githubMocks.GitHubClient).toHaveBeenCalledWith("ghp_test");
    expect(contextMocks.collectAnalysisContext).toHaveBeenCalledWith(expect.any(Object), "octo", "repo", 42);
    expect(llmMocks.analyzeWithLlm).toHaveBeenCalledWith({
      llm: {
        baseUrl: "https://llm.example/v1",
        apiKey: "sk_test",
        model: "reviewer",
      },
      context: analysisContext,
    });
  });

  it("returns structured redacted errors", async () => {
    contextMocks.collectAnalysisContext.mockRejectedValue(
      createApiError(
        "GITHUB_FORBIDDEN",
        "Token ghp_secret cannot read repo with key sk_secret",
        { githubToken: "ghp_secret", apiKey: "sk_secret" },
        403,
      ),
    );

    const response = await analyzePullRequest(
      jsonRequest({
        owner: "octo",
        repo: "repo",
        pullNumber: 42,
        githubToken: "ghp_secret",
        llm: {
          baseUrl: "https://llm.example/v1",
          apiKey: "sk_secret",
          model: "reviewer",
        },
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ code: "GITHUB_FORBIDDEN" });
    expect(body).not.toHaveProperty("error");
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
    expect(JSON.stringify(body)).not.toContain("sk_secret");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

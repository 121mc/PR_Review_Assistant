import { beforeEach, describe, expect, it, vi } from "vitest";
import { dynamic as commentDynamic, POST as publishComment } from "../app/api/github/comment/route";
import { dynamic as pullDetailDynamic, POST as pullDetail } from "../app/api/github/pull-detail/route";
import { dynamic as pullsDynamic, POST as listPulls } from "../app/api/github/pulls/route";
import { createApiError } from "../lib/errors";
import type { PullRequestDetail, PullRequestSummary } from "../lib/types";

const githubMocks = vi.hoisted(() => ({
  GitHubClient: vi.fn(),
  createPullComment: vi.fn(),
  getPullDetail: vi.fn(),
  listOpenPulls: vi.fn(),
}));

vi.mock("../lib/github", () => ({
  GitHubClient: githubMocks.GitHubClient,
}));

const summary: PullRequestSummary = {
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
};

const detail: PullRequestDetail = {
  summary,
  body: "Fixes a bug",
  additions: 3,
  deletions: 1,
  changedFiles: 1,
  mergeable: true,
  draft: false,
};

beforeEach(() => {
  githubMocks.GitHubClient.mockClear();
  githubMocks.GitHubClient.mockImplementation(function GitHubClientMock() {
    return {
      createPullComment: githubMocks.createPullComment,
      getPullDetail: githubMocks.getPullDetail,
      listOpenPulls: githubMocks.listOpenPulls,
    };
  });
  githubMocks.createPullComment.mockReset();
  githubMocks.getPullDetail.mockReset();
  githubMocks.listOpenPulls.mockReset();
  githubMocks.createPullComment.mockResolvedValue({
    commentUrl: "https://github.com/octo/repo/pull/42#issuecomment-1",
  });
  githubMocks.getPullDetail.mockResolvedValue(detail);
  githubMocks.listOpenPulls.mockResolvedValue([summary]);
});

describe("GitHub API routes", () => {
  it("exports force-dynamic route config", () => {
    expect(pullsDynamic).toBe("force-dynamic");
    expect(pullDetailDynamic).toBe("force-dynamic");
    expect(commentDynamic).toBe("force-dynamic");
  });

  it("lists open pull requests", async () => {
    const response = await listPulls(jsonRequest({ owner: "octo", repo: "repo", githubToken: "ghp_test" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ pulls: [summary] });
    expect(githubMocks.GitHubClient).toHaveBeenCalledWith("ghp_test");
    expect(githubMocks.listOpenPulls).toHaveBeenCalledWith("octo", "repo");
  });

  it("returns only pullRequest from pull-detail", async () => {
    const response = await pullDetail(
      jsonRequest({ owner: "octo", repo: "repo", pullNumber: 42, githubToken: "ghp_test" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ pullRequest: detail });
    expect(Object.keys(body)).toEqual(["pullRequest"]);
  });

  it("rejects empty comment bodies", async () => {
    const response = await publishComment(
      jsonRequest({ owner: "octo", repo: "repo", pullNumber: 42, githubToken: "ghp_test", body: "" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "COMMENT_BODY_EMPTY" });
    expect(githubMocks.createPullComment).not.toHaveBeenCalled();
  });

  it("rejects comment publishing when github token is empty", async () => {
    const response = await publishComment(
      jsonRequest({ owner: "octo", repo: "repo", pullNumber: 42, githubToken: " ", body: "Looks good." }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "GITHUB_UNAUTHORIZED" });
    expect(githubMocks.GitHubClient).not.toHaveBeenCalled();
    expect(githubMocks.createPullComment).not.toHaveBeenCalled();
  });

  it("returns top-level redacted errors from comment publishing", async () => {
    githubMocks.createPullComment.mockRejectedValue(
      createApiError(
        "GITHUB_FORBIDDEN",
        "Token ghp_secret cannot publish comments",
        { githubToken: "ghp_secret", authorization: "Bearer ghp_secret" },
        403,
      ),
    );

    const response = await publishComment(
      jsonRequest({ owner: "octo", repo: "repo", pullNumber: 42, githubToken: "ghp_secret", body: "Looks good." }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ code: "GITHUB_FORBIDDEN" });
    expect(body).not.toHaveProperty("error");
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

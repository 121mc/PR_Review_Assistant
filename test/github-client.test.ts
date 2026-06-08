import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { GitHubClient } from "../lib/github";
import { githubApiUrl } from "./msw/handlers";
import { useMswHandlers } from "./msw/server";

describe("GitHubClient", () => {
  it("lists open pull requests", async () => {
    useMswHandlers(
      http.get(githubApiUrl("/repos/octo/repo/pulls"), ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("state")).toBe("open");
        expect(request.headers.get("accept")).toBe("application/vnd.github+json");
        expect(request.headers.get("authorization")).toBe("Bearer ghp_test");

        return HttpResponse.json([
          githubPullResponse({
            number: 42,
            title: "Fix bug",
            user: { login: "alice" },
            state: "open",
            base: { ref: "main" },
            head: { ref: "fix-bug" },
            updated_at: "2026-06-08T00:00:00Z",
            html_url: "https://github.com/octo/repo/pull/42",
          }),
        ]);
      }),
    );

    const pulls = await new GitHubClient("ghp_test").listOpenPulls("octo", "repo");

    expect(pulls).toEqual([
      {
        owner: "octo",
        repo: "repo",
        number: 42,
        title: "Fix bug",
        author: "alice",
        state: "open",
        baseRef: "main",
        headRef: "fix-bug",
        updatedAt: "2026-06-08T00:00:00Z",
        url: "https://github.com/octo/repo/pull/42",
      },
    ]);
  });

  it("publishes an issue comment for a pull request", async () => {
    useMswHandlers(
      http.post(githubApiUrl("/repos/octo/repo/issues/42/comments"), async ({ request }) => {
        expect(request.headers.get("accept")).toBe("application/vnd.github+json");
        expect(request.headers.get("authorization")).toBe("Bearer ghp_test");
        await expect(request.json()).resolves.toEqual({ body: "Looks good." });

        return HttpResponse.json({ html_url: "https://github.com/octo/repo/pull/42#issuecomment-1" });
      }),
    );

    const result = await new GitHubClient("ghp_test").createPullComment("octo", "repo", 42, "Looks good.");

    expect(result).toEqual({ commentUrl: "https://github.com/octo/repo/pull/42#issuecomment-1" });
  });

  it("paginates changed files", async () => {
    useMswHandlers(
      http.get(githubApiUrl("/repos/octo/repo/pulls/42/files"), ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get("page");
        expect(url.searchParams.get("per_page")).toBe("100");

        if (page === "1") {
          return HttpResponse.json(
            Array.from({ length: 100 }, (_, index) =>
              changedFileResponse({ filename: `src/file-${index + 1}.ts`, patch: "@@ patch" }),
            ),
          );
        }

        return HttpResponse.json([changedFileResponse({ filename: "src/final.ts", patch: undefined })]);
      }),
    );

    const files = await new GitHubClient("ghp_test").listChangedFiles("octo", "repo", 42);

    expect(files).toHaveLength(101);
    expect(files.at(-1)).toMatchObject({
      filename: "src/final.ts",
      isBinary: true,
      truncated: false,
    });
  });

  it("omits the authorization header when token is empty", async () => {
    useMswHandlers(
      http.get(githubApiUrl("/repos/octo/repo/pulls"), ({ request }) => {
        expect(request.headers.get("authorization")).toBeNull();

        return HttpResponse.json([]);
      }),
    );

    await expect(new GitHubClient("").listOpenPulls("octo", "repo")).resolves.toEqual([]);
  });

  it("maps unauthorized GitHub responses to GITHUB_UNAUTHORIZED", async () => {
    useMswHandlers(
      http.get(githubApiUrl("/repos/octo/repo/pulls"), () =>
        HttpResponse.json({ message: "Bad credentials" }, { status: 401 }),
      ),
    );

    await expect(new GitHubClient("bad-token").listOpenPulls("octo", "repo")).rejects.toMatchObject({
      code: "GITHUB_UNAUTHORIZED",
      status: 401,
    });
  });
});

function githubPullResponse(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: "Default PR",
    user: { login: "octocat" },
    state: "open",
    base: { ref: "main" },
    head: { ref: "feature" },
    updated_at: "2026-06-08T00:00:00Z",
    html_url: "https://github.com/octo/repo/pull/1",
    body: "",
    additions: 0,
    deletions: 0,
    changed_files: 0,
    mergeable: true,
    draft: false,
    ...overrides,
  };
}

function changedFileResponse(overrides: Record<string, unknown> = {}) {
  return {
    filename: "src/file.ts",
    status: "modified",
    additions: 2,
    deletions: 1,
    changes: 3,
    patch: "@@ patch",
    raw_url: "https://raw.githubusercontent.com/octo/repo/ref/src/file.ts",
    ...overrides,
  };
}

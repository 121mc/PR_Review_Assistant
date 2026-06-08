import { describe, expect, it } from "vitest";
import { collectAnalysisContext } from "../lib/context";
import type { ChangedFile, PullRequestDetail } from "../lib/types";

// ─── Fake GitHub client helper ────────────────────────────────────────────────

interface FakeClientOptions {
  changedFiles: Array<{ filename: string; patch?: string; isBinary: boolean }>;
  files?: Record<string, string>;
}

function makePullDetail(): PullRequestDetail {
  return {
    summary: {
      owner: "octo",
      repo: "repo",
      number: 42,
      title: "Test PR",
      author: "alice",
      state: "open",
      baseRef: "main",
      headRef: "fix-branch",
      updatedAt: "2026-06-08T00:00:00Z",
      url: "https://github.com/octo/repo/pull/42",
    },
    body: "Fixes a bug.",
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    draft: false,
  };
}

function fakeGitHubClient(opts: FakeClientOptions) {
  const rawFiles: ChangedFile[] = opts.changedFiles.map((f) => ({
    filename: f.filename,
    status: "modified",
    additions: 5,
    deletions: 1,
    changes: 6,
    patch: f.patch,
    isBinary: f.isBinary,
    truncated: false,
  }));

  return {
    getPullDetail: async () => makePullDetail(),
    listChangedFiles: async () => rawFiles,
    getFileContent: async (_owner: string, _repo: string, path: string) => {
      return opts.files?.[path] ?? null;
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("collectAnalysisContext", () => {
  it("adds TypeScript repository context for TypeScript changes", async () => {
    const github = fakeGitHubClient({
      changedFiles: [{ filename: "app/page.tsx", patch: "@@ patch", isBinary: false }],
      files: {
        "package.json": '{"scripts":{"test":"vitest"}}',
        "tsconfig.json": '{"compilerOptions":{"strict":true}}',
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);
    expect(context.detectedLanguages).toContain("TypeScript");
    expect(context.contextFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining(["package.json", "tsconfig.json"]),
    );
  });

  it("marks context as truncated when content exceeds budget", async () => {
    const github = fakeGitHubClient({
      changedFiles: [{ filename: "src/main.py", patch: "x".repeat(200000), isBinary: false }],
      files: { "pyproject.toml": "[tool.pytest.ini_options]" },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, { maxChars: 1000 });
    expect(context.truncated).toBe(true);
    expect(context.truncationNotes.length).toBeGreaterThan(0);
  });

  it("does not let one huge patch starve repository context", async () => {
    const github = fakeGitHubClient({
      changedFiles: [
        { filename: "src/generated.ts", patch: "x".repeat(200000), isBinary: false },
        { filename: "src/feature.ts", patch: "@@ small useful patch", isBinary: false },
      ],
      files: {
        "package.json": '{"scripts":{"test":"vitest"}}',
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, {
      maxChars: 12000,
      maxPatchChars: 4000,
      maxRepoContextFileChars: 2000,
    });

    expect(
      context.changedFiles.find((file) => file.filename === "src/generated.ts")?.truncated,
    ).toBe(true);
    expect(
      context.changedFiles.find((file) => file.filename === "src/feature.ts")?.patch,
    ).toContain("small useful");
    expect(context.contextFiles.map((file) => file.path)).toContain("package.json");
    expect(context.truncationNotes.join("\n")).toContain("Patch truncated");
  });

  it("skips binary files without error", async () => {
    const github = fakeGitHubClient({
      changedFiles: [{ filename: "assets/image.png", isBinary: true }],
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);
    expect(context.changedFiles[0].truncated).toBe(false);
    expect(context.truncated).toBe(false);
  });

  it("detects Python language from .py extensions", async () => {
    const github = fakeGitHubClient({
      changedFiles: [{ filename: "src/main.py", patch: "@@ -1 +1", isBinary: false }],
      files: { "pyproject.toml": "[build-system]" },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);
    expect(context.detectedLanguages).toContain("Python");
    expect(context.contextFiles.map((f) => f.path)).toContain("pyproject.toml");
  });

  it("does not include files that do not exist in the repo", async () => {
    const github = fakeGitHubClient({
      changedFiles: [{ filename: "src/main.go", patch: "@@ -1 +1", isBinary: false }],
      files: {}, // no context files available
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);
    expect(context.contextFiles).toHaveLength(0);
  });

  it("returns correct repository ref", async () => {
    const github = fakeGitHubClient({
      changedFiles: [{ filename: "README.md", patch: "@@ -1 +1", isBinary: false }],
    });

    const context = await collectAnalysisContext(github, "myorg", "myrepo", 7);
    expect(context.repository).toEqual({
      owner: "myorg",
      repo: "myrepo",
      url: "https://github.com/myorg/myrepo",
    });
  });
});

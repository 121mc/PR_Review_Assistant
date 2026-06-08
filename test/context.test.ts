import { describe, expect, it, vi } from "vitest";
import { collectAnalysisContext } from "../lib/context";
import type { ChangedFile, PullRequestDetail } from "../lib/types";

describe("collectAnalysisContext", () => {
  it("adds TypeScript repository context for TypeScript changes", async () => {
    const github = fakeGitHubClient({
      changedFiles: [
        changedFile({
          filename: "app/page.tsx",
          patch: "@@ -1 +1 @@\n+export default function Page() { return null; }",
        }),
      ],
      files: {
        "package.json": '{"scripts":{"test":"vitest"}}',
        "tsconfig.json": '{"compilerOptions":{"strict":true}}',
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);

    expect(context.repository).toEqual({ owner: "octo", repo: "repo", url: "https://github.com/octo/repo" });
    expect(context.detectedLanguages).toEqual(["TypeScript"]);
    expect(context.contextFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "package.json", kind: "package", truncated: false }),
        expect.objectContaining({ path: "tsconfig.json", kind: "build", truncated: false }),
      ]),
    );
    expect(github.getFileContent).toHaveBeenCalledWith("octo", "repo", "package.json", "main");
    expect(github.getFileContent).toHaveBeenCalledWith("octo", "repo", "tsconfig.json", "main");
  });

  it("marks context as truncated when content exceeds budget", async () => {
    const hugePatch = "x".repeat(5000);
    const github = fakeGitHubClient({
      changedFiles: [changedFile({ filename: "src/main.py", patch: hugePatch })],
      files: { "pyproject.toml": "[tool.pytest.ini_options]\npythonpath = [\".\"]" },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, {
      maxChars: 1800,
      maxPatchChars: 300,
      maxRepoContextFileChars: 200,
    });

    expect(context.truncated).toBe(true);
    expect(context.changedFiles[0].truncated).toBe(true);
    expect(context.changedFiles[0].patch).toContain("[Patch truncated due to file-size limit]");
    expect(context.changedFiles[0].patch?.length).toBeLessThan(hugePatch.length);
    expect(context.truncationNotes.join("\n")).toContain("Patch truncated");
  });

  it("does not let one huge patch starve a small useful patch or repository context", async () => {
    const github = fakeGitHubClient({
      changedFiles: [
        changedFile({ filename: "src/generated.ts", patch: "x".repeat(20000) }),
        changedFile({ filename: "src/feature.ts", patch: "@@ -1 +1 @@\n+small useful patch" }),
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

    expect(context.changedFiles.find((file) => file.filename === "src/generated.ts")?.truncated).toBe(true);
    expect(context.changedFiles.find((file) => file.filename === "src/feature.ts")?.patch).toContain("small useful");
    expect(context.contextFiles.map((file) => file.path)).toContain("package.json");
    expect(context.truncationNotes.join("\n")).toContain("Patch truncated");
  });

  it("preserves small patches and repository context under tight global budget pressure", async () => {
    const github = fakeGitHubClient({
      changedFiles: [
        changedFile({ filename: "src/generated.ts", patch: "x".repeat(50000) }),
        changedFile({ filename: "src/feature.ts", patch: "@@ -1 +1 @@\n+small useful patch" }),
      ],
      files: {
        "package.json": '{"scripts":{"test":"vitest"}}',
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, {
      maxChars: 4200,
      maxPatchChars: 4000,
      maxRepoContextFileChars: 400,
    });

    const generated = context.changedFiles.find((file) => file.filename === "src/generated.ts");
    const feature = context.changedFiles.find((file) => file.filename === "src/feature.ts");

    expect(generated?.truncated).toBe(true);
    expect(feature?.patch).toContain("small useful patch");
    expect(context.contextFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "package.json", content: expect.stringContaining("vitest") })]),
    );
    expect(context.truncated).toBe(true);
  });

  it("keeps truncation markers inside per-file content budgets", async () => {
    const github = fakeGitHubClient({
      changedFiles: [changedFile({ filename: "src/main.ts", patch: "p".repeat(1000) })],
      files: {
        "package.json": "r".repeat(1000),
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, {
      maxChars: 3000,
      maxPatchChars: 120,
      maxRepoContextFileChars: 160,
    });

    expect(context.changedFiles[0].patch).toContain("[Patch truncated due to file-size limit]");
    expect(context.changedFiles[0].patch?.length).toBeLessThanOrEqual(120);
    expect(context.contextFiles.find((file) => file.path === "package.json")?.content).toContain(
      "[Repository context file truncated due to file-size limit]",
    );
    expect(context.contextFiles.find((file) => file.path === "package.json")?.content.length).toBeLessThanOrEqual(160);
  });

  it("does not let a large repository context file starve a small patch", async () => {
    const github = fakeGitHubClient({
      changedFiles: [changedFile({ filename: "src/feature.ts", patch: "@@ -1 +1 @@\n+small useful patch" })],
      files: {
        "README.md": "r".repeat(5000),
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, {
      maxChars: 1500,
      maxPatchChars: 120,
      maxRepoContextFileChars: 500,
    });

    expect(context.changedFiles[0].patch ?? "").toContain("small useful patch");
    expect(context.contextFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "README.md", kind: "readme", truncated: true })]),
    );
    expect(context.contextFiles.find((file) => file.path === "README.md")?.content.length).toBeLessThanOrEqual(500);
  });

  it("collects discovered GitHub workflow files as CI context", async () => {
    const github = fakeGitHubClient({
      changedFiles: [changedFile({ filename: "src/feature.ts" })],
      files: {
        ".github/workflows/ci.yml": "name: CI\non: [push]\n",
      },
      directoryFiles: {
        ".github/workflows": [".github/workflows/ci.yml"],
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);

    expect(github.listDirectoryFilePaths).toHaveBeenCalledWith("octo", "repo", ".github/workflows", "main");
    expect(context.contextFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ".github/workflows/ci.yml", kind: "ci", content: expect.stringContaining("CI") }),
      ]),
    );
  });

  it("skips low-priority content instead of storing markers after the global budget is exhausted", async () => {
    const github = fakeGitHubClient({
      changedFiles: [changedFile({ filename: "src/file.ts", patch: "p".repeat(1000) })],
      files: {
        "package.json": '{"scripts":{"test":"vitest"}}',
        "src/file.ts": "export const value = 1;\n",
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, {
      maxChars: 50,
      maxPatchChars: 120,
      maxRepoContextFileChars: 120,
    });

    expect(context.changedFiles[0].patch).toBeUndefined();
    expect(context.contextFiles).toEqual([]);
    expect(context.changedFiles[0].contentSnippet).toBeUndefined();
    expect(context.truncationNotes.join("\n")).toContain("Skipped patch");
  });

  it("marks high-priority overflow when serialized metadata and summaries exceed budget", async () => {
    const maxChars = 2500;
    const github = fakeGitHubClient({
      changedFiles: Array.from({ length: 20 }, (_, index) =>
        changedFile({
          filename: `src/components/feature-${index.toString().padStart(2, "0")}.ts`,
          patch: undefined,
          rawUrl: undefined,
          isBinary: true,
        }),
      ),
      files: {},
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42, { maxChars });
    const serializedLength = JSON.stringify(context, null, 2).length;

    if (serializedLength > maxChars) {
      expect(context.truncated).toBe(true);
      expect(context.truncationNotes.join("\n")).toMatch(/high-priority.*exceed/i);
    } else {
      expect(serializedLength).toBeLessThanOrEqual(maxChars);
    }
  });

  it("fetches changed file snippets from the fork head repository at the head SHA", async () => {
    const headSha = "abc123forksha";
    const github = fakeGitHubClient({
      pullRequest: {
        summary: {
          ...pullRequestDetail().summary,
          headRef: "feature-branch",
          headSha,
          headRepository: { owner: "forker", repo: "forked-repo", url: "https://github.com/forker/forked-repo" },
        },
      } as Partial<PullRequestDetail>,
      changedFiles: [changedFile({ filename: "src/file.ts", patch: "@@ -1 +1 @@\n+export const value = 1;" })],
      files: {},
    });
    github.getFileContent.mockImplementation(async (requestOwner, requestRepo, path, ref) => {
      if (requestOwner === "forker" && requestRepo === "forked-repo" && path === "src/file.ts" && ref === headSha) {
        return "export const value = 1;\n";
      }
      return null;
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);

    expect(github.getFileContent).toHaveBeenCalledWith("forker", "forked-repo", "src/file.ts", headSha);
    expect(github.getFileContent).not.toHaveBeenCalledWith("octo", "repo", "src/file.ts", "feature-branch");
    expect(context.changedFiles[0].contentSnippet).toBe("export const value = 1;\n");
  });

  it("uses canonical language labels and repository context kinds", async () => {
    const github = fakeGitHubClient({
      changedFiles: [
        changedFile({ filename: "src/app.js" }),
        changedFile({ filename: "scripts/tool.py" }),
        changedFile({ filename: "src/App.java" }),
        changedFile({ filename: "cmd/server/main.go" }),
        changedFile({ filename: "docs/notes.md" }),
      ],
      files: {
        "README.md": "# Project",
        "CONTRIBUTING.md": "Please open small PRs.",
        ".eslintrc.json": "{}",
        "jest.config.js": "module.exports = {};",
        "go.mod": "module example.com/repo",
        ".github/pull_request_template.md": "## Checklist",
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);
    const kindsByPath = new Map(context.contextFiles.map((file) => [file.path, file.kind]));

    expect(context.detectedLanguages).toEqual(["JavaScript", "Python", "Java", "Go", "Other"]);
    expect(kindsByPath.get("README.md")).toBe("readme");
    expect(kindsByPath.get("CONTRIBUTING.md")).toBe("contributing");
    expect(kindsByPath.get(".eslintrc.json")).toBe("lint");
    expect(kindsByPath.get("jest.config.js")).toBe("test");
    expect(kindsByPath.get("go.mod")).toBe("build");
    expect(kindsByPath.get(".github/pull_request_template.md")).toBe("other");
  });

  it("skips binary files and files with no text content", async () => {
    const github = fakeGitHubClient({
      changedFiles: [
        changedFile({ filename: "assets/logo.png", patch: undefined, isBinary: true }),
        changedFile({ filename: "src/file.ts", patch: "@@ -1 +1 @@\n+export const value = 1;" }),
      ],
      files: {
        "package.json": null,
        "src/file.ts": "export const value = 1;\n",
      },
    });

    const context = await collectAnalysisContext(github, "octo", "repo", 42);

    expect(context.contextFiles.map((file) => file.path)).not.toContain("package.json");
    expect(context.changedFiles.find((file) => file.filename === "assets/logo.png")?.contentSnippet).toBeUndefined();
    expect(context.changedFiles.find((file) => file.filename === "src/file.ts")?.contentSnippet).toBe(
      "export const value = 1;\n",
    );
    expect(github.getFileContent).not.toHaveBeenCalledWith("octo", "repo", "assets/logo.png", "feature");
  });
});

function fakeGitHubClient(input: {
  pullRequest?: Partial<PullRequestDetail>;
  changedFiles: ChangedFile[];
  files?: Record<string, string | null>;
  directoryFiles?: Record<string, string[]>;
}) {
  const pullRequest = pullRequestDetail(input.pullRequest);
  const files = input.files ?? {};
  const directoryFiles = input.directoryFiles ?? {};

  return {
    getPullDetail: vi.fn(async () => pullRequest),
    listChangedFiles: vi.fn(async () => input.changedFiles),
    getFileContent: vi.fn(async (_owner: string, _repo: string, path: string, ref: string) => {
      void ref;
      return files[path] ?? null;
    }),
    listDirectoryFilePaths: vi.fn(async (_owner: string, _repo: string, path: string) => directoryFiles[path] ?? []),
  };
}

function pullRequestDetail(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    summary: {
      owner: "octo",
      repo: "repo",
      number: 42,
      title: "Fix bug",
      author: "alice",
      state: "open",
      baseRef: "main",
      headRef: "feature",
      updatedAt: "2026-06-08T00:00:00Z",
      url: "https://github.com/octo/repo/pull/42",
    },
    body: "This PR fixes a bug.",
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    mergeable: true,
    draft: false,
    ...overrides,
  };
}

function changedFile(overrides: Partial<ChangedFile> = {}): ChangedFile {
  return {
    filename: "src/file.ts",
    status: "modified",
    additions: 1,
    deletions: 0,
    changes: 1,
    patch: "@@ -1 +1 @@\n+change",
    rawUrl: "https://raw.githubusercontent.com/octo/repo/ref/src/file.ts",
    isBinary: false,
    truncated: false,
    ...overrides,
  };
}

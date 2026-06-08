import type { GitHubClient } from "./github";
import type {
  AnalysisContext,
  ChangedFile,
  RepositoryContextFile,
  RepositoryRef,
} from "./types";

// ─── Budget constants ────────────────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 120_000;
const DEFAULT_MAX_PATCH_CHARS = 8_000;
const DEFAULT_MAX_REPO_CONTEXT_FILE_CHARS = 5_000;

// ─── Language detection ──────────────────────────────────────────────────────

const LANGUAGE_EXT_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  // Python
  py: "Python",
  // Java / Kotlin
  java: "Java",
  kt: "Kotlin",
  // Go
  go: "Go",
  // Ruby
  rb: "Ruby",
  // Rust
  rs: "Rust",
  // C / C++
  c: "C",
  cpp: "C++",
  cc: "C++",
  h: "C",
  // PHP
  php: "PHP",
  // Swift
  swift: "Swift",
};

function detectLanguages(filenames: string[]): string[] {
  const langs = new Set<string>();
  for (const name of filenames) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const lang = LANGUAGE_EXT_MAP[ext];
    if (lang) langs.add(lang);
  }
  return [...langs];
}

// ─── Context file candidates ─────────────────────────────────────────────────

type ContextFileKind = RepositoryContextFile["kind"];

interface CandidateDef {
  path: string;
  kind: ContextFileKind;
}

const COMMON_CANDIDATES: CandidateDef[] = [
  { path: "README.md", kind: "readme" },
  { path: "README", kind: "readme" },
  { path: "CONTRIBUTING.md", kind: "contributing" },
  { path: "CONTRIBUTING", kind: "contributing" },
  { path: ".github/pull_request_template.md", kind: "contributing" },
];

const LANGUAGE_CANDIDATES: Record<string, CandidateDef[]> = {
  TypeScript: [
    { path: "package.json", kind: "package" },
    { path: "tsconfig.json", kind: "language" },
    { path: ".eslintrc", kind: "lint" },
    { path: ".eslintrc.json", kind: "lint" },
    { path: "eslint.config.js", kind: "lint" },
    { path: ".prettierrc", kind: "lint" },
    { path: "prettier.config.js", kind: "lint" },
    { path: "jest.config.js", kind: "test" },
    { path: "vitest.config.ts", kind: "test" },
    { path: "next.config.ts", kind: "build" },
  ],
  JavaScript: [
    { path: "package.json", kind: "package" },
    { path: ".eslintrc", kind: "lint" },
    { path: ".eslintrc.json", kind: "lint" },
    { path: "eslint.config.js", kind: "lint" },
    { path: ".prettierrc", kind: "lint" },
    { path: "jest.config.js", kind: "test" },
    { path: "vitest.config.ts", kind: "test" },
  ],
  Python: [
    { path: "pyproject.toml", kind: "build" },
    { path: "requirements.txt", kind: "build" },
    { path: "setup.cfg", kind: "build" },
    { path: "ruff.toml", kind: "lint" },
    { path: "mypy.ini", kind: "lint" },
    { path: "pytest.ini", kind: "test" },
  ],
  Java: [
    { path: "pom.xml", kind: "build" },
    { path: "build.gradle", kind: "build" },
    { path: "checkstyle.xml", kind: "lint" },
    { path: "spotbugs.xml", kind: "lint" },
  ],
  Kotlin: [
    { path: "build.gradle", kind: "build" },
    { path: "build.gradle.kts", kind: "build" },
  ],
  Go: [
    { path: "go.mod", kind: "build" },
    { path: "go.sum", kind: "build" },
    { path: ".golangci.yml", kind: "lint" },
  ],
};

function candidatesForLanguages(langs: string[]): CandidateDef[] {
  const seen = new Set<string>();
  const result: CandidateDef[] = [...COMMON_CANDIDATES];

  for (const lang of langs) {
    const defs = LANGUAGE_CANDIDATES[lang] ?? [];
    for (const def of defs) {
      if (!seen.has(def.path)) {
        seen.add(def.path);
        result.push(def);
      }
    }
  }

  return result;
}

// ─── Truncation helpers ──────────────────────────────────────────────────────

function truncateText(text: string, limit: number, note: string): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + `\n[${note}]`, truncated: true };
}

// ─── Main collector ──────────────────────────────────────────────────────────

export interface CollectOptions {
  maxChars?: number;
  maxPatchChars?: number;
  maxRepoContextFileChars?: number;
}

export async function collectAnalysisContext(
  github: Pick<GitHubClient, "getPullDetail" | "listChangedFiles" | "getFileContent">,
  owner: string,
  repo: string,
  pullNumber: number,
  options: CollectOptions = {},
): Promise<AnalysisContext> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const maxPatchChars = options.maxPatchChars ?? DEFAULT_MAX_PATCH_CHARS;
  const maxRepoContextFileChars =
    options.maxRepoContextFileChars ?? DEFAULT_MAX_REPO_CONTEXT_FILE_CHARS;

  const truncationNotes: string[] = [];
  let charBudget = maxChars;

  // 1. Fetch PR detail (always included fully)
  const pullRequest = await github.getPullDetail(owner, repo, pullNumber);

  const repository: RepositoryRef = {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };

  // PR metadata uses some budget but is never skipped
  const metaApprox =
    JSON.stringify(pullRequest).length;
  charBudget -= metaApprox;

  // 2. Fetch changed files
  const rawFiles = await github.listChangedFiles(owner, repo, pullNumber);

  // Detect languages from changed file extensions
  const detectedLanguages = detectLanguages(rawFiles.map((f) => f.filename));

  // 3. Apply per-file patch truncation
  const changedFiles: ChangedFile[] = rawFiles.map((file) => {
    if (file.isBinary || !file.patch) {
      return { ...file, truncated: false };
    }

    const { text, truncated } = truncateText(
      file.patch,
      maxPatchChars,
      "Patch truncated due to file-size limit",
    );

    if (truncated) {
      truncationNotes.push(`Patch truncated: ${file.filename}`);
    }

    const patchCost = text.length;
    charBudget -= patchCost;

    return { ...file, patch: text, truncated };
  });

  // 4. Fetch repository context files within remaining budget
  const candidates = candidatesForLanguages(detectedLanguages);
  const headRef = pullRequest.summary.headRef;

  const contextFiles: RepositoryContextFile[] = [];

  for (const candidate of candidates) {
    if (charBudget <= 0) break;

    let content: string | null = null;
    try {
      content = await github.getFileContent(owner, repo, candidate.path, headRef);
    } catch {
      // file not found or permission error — skip silently
    }

    if (!content) continue;

    const { text, truncated } = truncateText(
      content,
      Math.min(maxRepoContextFileChars, charBudget),
      "Content truncated due to context budget",
    );

    if (truncated) {
      truncationNotes.push(`Context file truncated: ${candidate.path}`);
    }

    charBudget -= text.length;

    contextFiles.push({
      path: candidate.path,
      kind: candidate.kind,
      content: text,
      truncated,
    });
  }

  const overallTruncated = truncationNotes.length > 0 || charBudget < 0;

  return {
    repository,
    pullRequest,
    changedFiles,
    contextFiles,
    detectedLanguages,
    truncated: overallTruncated,
    truncationNotes,
  };
}

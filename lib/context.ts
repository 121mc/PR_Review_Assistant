import type { GitHubClient } from "./github";
import type {
  AnalysisContext,
  ChangedFile,
  PullRequestDetail,
  RepositoryContextFile,
  RepositoryContextFileKind,
} from "./types";

export const MAX_CONTEXT_CHARS = 120000;
export const MAX_PATCH_CHARS = 8000;
export const MAX_REPO_CONTEXT_FILE_CHARS = 5000;

const PATCH_TRUNCATION_MARKER = "[Patch truncated due to file-size limit]";
const REPO_CONTEXT_TRUNCATION_MARKER = "[Repository context file truncated due to file-size limit]";
const CONTENT_SNIPPET_TRUNCATION_MARKER = "[Content snippet truncated due to file-size limit]";

const LANGUAGE_ORDER = ["TypeScript", "JavaScript", "Python", "Java", "Go", "Other"] as const;
type CanonicalLanguage = (typeof LANGUAGE_ORDER)[number];

const COMMON_CONTEXT_PATHS = [
  "README.md",
  "README",
  "CONTRIBUTING.md",
  "CONTRIBUTING",
  ".github/pull_request_template.md",
] as const;

const LANGUAGE_CONTEXT_PATHS: Record<Exclude<CanonicalLanguage, "Other">, readonly string[]> = {
  TypeScript: [
    "package.json",
    "tsconfig.json",
    ".eslintrc",
    ".eslintrc.json",
    "eslint.config.js",
    ".prettierrc",
    "prettier.config.js",
    "jest.config.js",
    "vitest.config.ts",
    "next.config.ts",
  ],
  JavaScript: [
    "package.json",
    "tsconfig.json",
    ".eslintrc",
    ".eslintrc.json",
    "eslint.config.js",
    ".prettierrc",
    "prettier.config.js",
    "jest.config.js",
    "vitest.config.ts",
    "next.config.ts",
  ],
  Python: ["pyproject.toml", "requirements.txt", "setup.cfg", "ruff.toml", "mypy.ini", "pytest.ini"],
  Java: ["pom.xml", "build.gradle", "checkstyle.xml", "spotbugs.xml"],
  Go: ["go.mod", "go.sum", ".golangci.yml"],
};

interface ContextCollectionOptions {
  maxChars?: number;
  maxPatchChars?: number;
  maxRepoContextFileChars?: number;
}

interface Budget {
  maxChars: number;
  usedChars: number;
}

export async function collectAnalysisContext(
  github: Pick<GitHubClient, "getPullDetail" | "listChangedFiles" | "getFileContent">,
  owner: string,
  repo: string,
  pullNumber: number,
  options: ContextCollectionOptions = {},
): Promise<AnalysisContext> {
  const budget: Budget = {
    maxChars: normalizeLimit(options.maxChars, MAX_CONTEXT_CHARS),
    usedChars: 0,
  };
  const maxPatchChars = normalizeLimit(options.maxPatchChars, MAX_PATCH_CHARS);
  const maxRepoContextFileChars = normalizeLimit(options.maxRepoContextFileChars, MAX_REPO_CONTEXT_FILE_CHARS);
  const truncationNotes: string[] = [];

  const [pullRequest, changedFilesFromGitHub] = await Promise.all([
    github.getPullDetail(owner, repo, pullNumber),
    github.listChangedFiles(owner, repo, pullNumber),
  ]);

  const detectedLanguageSet = new Set<CanonicalLanguage>();
  for (const file of changedFilesFromGitHub) {
    const language = detectLanguageFromPath(file.filename);
    if (language !== null) {
      detectedLanguageSet.add(language);
    }
  }

  consumeBudget(budget, estimatePullRequestChars(pullRequest) + owner.length + repo.length);
  const changedFiles = changedFilesFromGitHub.map((file) => copyChangedFileWithSummaryBudget(file, budget));
  markIfHighPriorityContentExceedsBudget(budget, truncationNotes);

  for (const file of changedFiles) {
    applyPatchBudget(file, budget, maxPatchChars, truncationNotes);
  }

  const contextFiles = await collectRepositoryContextFiles({
    github,
    owner,
    repo,
    ref: pullRequest.summary.baseRef,
    detectedLanguages: detectedLanguageSet,
    budget,
    maxRepoContextFileChars,
    truncationNotes,
  });

  for (const contextFile of contextFiles) {
    addRepositoryLanguageEvidence(detectedLanguageSet, contextFile.path);
  }

  await collectChangedFileSnippets({
    github,
    owner,
    repo,
    ref: pullRequest.summary.headRef,
    changedFiles,
    budget,
    maxSnippetChars: maxRepoContextFileChars,
    truncationNotes,
  });

  return {
    repository: { owner, repo, url: `https://github.com/${owner}/${repo}` },
    pullRequest,
    changedFiles,
    contextFiles,
    detectedLanguages: orderedLanguages(detectedLanguageSet),
    truncated: truncationNotes.length > 0,
    truncationNotes,
  };
}

function copyChangedFileWithSummaryBudget(file: ChangedFile, budget: Budget): ChangedFile {
  const copy: ChangedFile = { ...file };
  consumeBudget(budget, estimateChangedFileSummaryChars(copy));
  return copy;
}

function applyPatchBudget(
  file: ChangedFile,
  budget: Budget,
  maxPatchChars: number,
  truncationNotes: string[],
): void {
  if (file.isBinary || file.patch === undefined) {
    return;
  }

  const availableChars = Math.min(maxPatchChars, remainingBudget(budget));
  const truncatedByFileLimit = file.patch.length > maxPatchChars;
  const truncatedByContextLimit = file.patch.length > availableChars;

  if (truncatedByFileLimit || truncatedByContextLimit) {
    file.patch = truncateWithMarker(file.patch, availableChars, PATCH_TRUNCATION_MARKER);
    file.truncated = true;
    truncationNotes.push(
      truncatedByFileLimit
        ? `Patch truncated for ${file.filename} due to file-size limit.`
        : `Patch truncated for ${file.filename} due to context budget limit.`,
    );
  }

  consumeBudget(budget, file.patch.length);
}

async function collectRepositoryContextFiles(input: {
  github: Pick<GitHubClient, "getFileContent">;
  owner: string;
  repo: string;
  ref: string;
  detectedLanguages: Set<CanonicalLanguage>;
  budget: Budget;
  maxRepoContextFileChars: number;
  truncationNotes: string[];
}): Promise<RepositoryContextFile[]> {
  const contextFiles: RepositoryContextFile[] = [];

  for (const path of candidateContextPaths(input.detectedLanguages)) {
    if (remainingBudget(input.budget) <= 0) {
      input.truncationNotes.push(`Skipped repository context file ${path} due to context budget limit.`);
      break;
    }

    const content = await input.github.getFileContent(input.owner, input.repo, path, input.ref);
    if (content === null || content.length === 0) {
      continue;
    }

    const kind = contextKindForPath(path);
    const availableContentChars = Math.min(
      input.maxRepoContextFileChars,
      Math.max(0, remainingBudget(input.budget) - estimateRepositoryContextMetadataChars(path, kind)),
    );
    const truncated = content.length > availableContentChars;
    const storedContent = truncated
      ? truncateWithMarker(content, availableContentChars, REPO_CONTEXT_TRUNCATION_MARKER)
      : content;

    if (truncated) {
      input.truncationNotes.push(`Repository context file truncated for ${path} due to file-size limit.`);
    }

    contextFiles.push({ path, kind, content: storedContent, truncated });
    consumeBudget(input.budget, estimateRepositoryContextMetadataChars(path, kind) + storedContent.length);
  }

  return contextFiles;
}

async function collectChangedFileSnippets(input: {
  github: Pick<GitHubClient, "getFileContent">;
  owner: string;
  repo: string;
  ref: string;
  changedFiles: ChangedFile[];
  budget: Budget;
  maxSnippetChars: number;
  truncationNotes: string[];
}): Promise<void> {
  for (const file of input.changedFiles) {
    if (file.isBinary) {
      continue;
    }

    if (remainingBudget(input.budget) <= 0) {
      input.truncationNotes.push(`Skipped changed file content snippet for ${file.filename} due to context budget limit.`);
      break;
    }

    const content = await input.github.getFileContent(input.owner, input.repo, file.filename, input.ref);
    if (content === null || content.length === 0) {
      continue;
    }

    const availableSnippetChars = Math.min(
      input.maxSnippetChars,
      Math.max(0, remainingBudget(input.budget) - file.filename.length),
    );
    const truncated = content.length > availableSnippetChars;
    file.contentSnippet = truncated
      ? truncateWithMarker(content, availableSnippetChars, CONTENT_SNIPPET_TRUNCATION_MARKER)
      : content;

    if (truncated) {
      file.truncated = true;
      input.truncationNotes.push(`Changed file content snippet truncated for ${file.filename} due to file-size limit.`);
    }

    consumeBudget(input.budget, file.filename.length + file.contentSnippet.length);
  }
}

function candidateContextPaths(detectedLanguages: Set<CanonicalLanguage>): string[] {
  const paths = new Set<string>(COMMON_CONTEXT_PATHS);
  const languagesToLoad = new Set(detectedLanguages);

  if (languagesToLoad.size === 0 || (languagesToLoad.size === 1 && languagesToLoad.has("Other"))) {
    for (const language of LANGUAGE_ORDER) {
      languagesToLoad.add(language);
    }
  }

  for (const language of LANGUAGE_ORDER) {
    if (language === "Other" || !languagesToLoad.has(language)) {
      continue;
    }

    for (const path of LANGUAGE_CONTEXT_PATHS[language]) {
      paths.add(path);
    }
  }

  return [...paths];
}

function addRepositoryLanguageEvidence(languages: Set<CanonicalLanguage>, path: string): void {
  const language = detectLanguageFromPath(path, false);
  if (language === null) {
    return;
  }

  if (language === "JavaScript" && languages.has("TypeScript")) {
    return;
  }

  languages.add(language);
}

function detectLanguageFromPath(path: string, includeOther = true): CanonicalLanguage | null {
  const normalized = path.toLowerCase();
  const basename = normalized.split("/").at(-1) ?? normalized;

  if (normalized.endsWith(".ts") || normalized.endsWith(".tsx") || basename === "tsconfig.json") {
    return "TypeScript";
  }
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".jsx") ||
    normalized.endsWith(".mjs") ||
    normalized.endsWith(".cjs") ||
    basename === "package.json" ||
    basename === ".eslintrc" ||
    basename === ".eslintrc.json" ||
    basename === "eslint.config.js" ||
    basename === ".prettierrc" ||
    basename === "prettier.config.js" ||
    basename === "jest.config.js"
  ) {
    return "JavaScript";
  }
  if (
    normalized.endsWith(".py") ||
    basename === "pyproject.toml" ||
    basename === "requirements.txt" ||
    basename === "setup.cfg" ||
    basename === "ruff.toml" ||
    basename === "mypy.ini" ||
    basename === "pytest.ini"
  ) {
    return "Python";
  }
  if (
    normalized.endsWith(".java") ||
    basename === "pom.xml" ||
    basename === "build.gradle" ||
    basename === "checkstyle.xml" ||
    basename === "spotbugs.xml"
  ) {
    return "Java";
  }
  if (normalized.endsWith(".go") || basename === "go.mod" || basename === "go.sum" || basename === ".golangci.yml") {
    return "Go";
  }

  return includeOther ? "Other" : null;
}

function orderedLanguages(languages: Set<CanonicalLanguage>): CanonicalLanguage[] {
  return LANGUAGE_ORDER.filter((language) => languages.has(language));
}

function contextKindForPath(path: string): RepositoryContextFileKind {
  const normalized = path.toLowerCase();
  const basename = normalized.split("/").at(-1) ?? normalized;

  if (basename === "readme" || basename.startsWith("readme.")) {
    return "readme";
  }
  if (basename === "contributing" || basename.startsWith("contributing.")) {
    return "contributing";
  }
  if (basename === "package.json") {
    return "package";
  }
  if (
    basename === ".eslintrc" ||
    basename === ".eslintrc.json" ||
    basename === "eslint.config.js" ||
    basename === ".prettierrc" ||
    basename === "prettier.config.js" ||
    basename === "ruff.toml" ||
    basename === "mypy.ini" ||
    basename === "checkstyle.xml" ||
    basename === "spotbugs.xml" ||
    basename === ".golangci.yml"
  ) {
    return "lint";
  }
  if (basename === "jest.config.js" || basename === "vitest.config.ts" || basename === "pytest.ini") {
    return "test";
  }
  if (
    basename === "tsconfig.json" ||
    basename === "next.config.ts" ||
    basename === "pom.xml" ||
    basename === "build.gradle" ||
    basename === "go.mod" ||
    basename === "go.sum" ||
    basename === "pyproject.toml" ||
    basename === "requirements.txt" ||
    basename === "setup.cfg"
  ) {
    return "build";
  }
  if (normalized.startsWith(".github/workflows/")) {
    return "ci";
  }

  return "other";
}

function truncateWithMarker(content: string, limit: number, marker: string): string {
  if (content.length <= limit) {
    return content;
  }

  if (limit <= 0) {
    return marker;
  }

  return `${content.slice(0, limit)}\n${marker}`;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function consumeBudget(budget: Budget, chars: number): void {
  budget.usedChars += Math.max(0, chars);
}

function remainingBudget(budget: Budget): number {
  return Math.max(0, budget.maxChars - budget.usedChars);
}

function markIfHighPriorityContentExceedsBudget(budget: Budget, truncationNotes: string[]): void {
  if (budget.usedChars > budget.maxChars) {
    truncationNotes.push("Context budget exceeded by high-priority pull request metadata or file summaries.");
  }
}

function estimatePullRequestChars(pullRequest: PullRequestDetail): number {
  return JSON.stringify(pullRequest).length;
}

function estimateChangedFileSummaryChars(file: ChangedFile): number {
  return (
    file.filename.length +
    file.status.length +
    String(file.additions).length +
    String(file.deletions).length +
    String(file.changes).length +
    (file.rawUrl?.length ?? 0) +
    20
  );
}

function estimateRepositoryContextMetadataChars(path: string, kind: RepositoryContextFileKind): number {
  return path.length + kind.length + 10;
}

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
const FALLBACK_WORKFLOW_CONTEXT_PATHS = [
  ".github/workflows/ci.yml",
  ".github/workflows/ci.yaml",
  ".github/workflows/test.yml",
  ".github/workflows/test.yaml",
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
  measureUsedChars: () => number;
}

interface FitTextInput {
  budget: Budget;
  content: string;
  marker: string;
  perFileLimit: number;
  apply: (content: string | null) => void;
}

interface FitTextResult {
  content: string | null;
  truncated: boolean;
}

interface ContextGitHubClient extends Pick<GitHubClient, "getPullDetail" | "listChangedFiles" | "getFileContent"> {
  listDirectoryFilePaths?(owner: string, repo: string, path: string, ref: string): Promise<string[]>;
}

export async function collectAnalysisContext(
  github: ContextGitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  options: ContextCollectionOptions = {},
): Promise<AnalysisContext> {
  const maxChars = normalizeLimit(options.maxChars, MAX_CONTEXT_CHARS);
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

  const repository = { owner, repo, url: `https://github.com/${owner}/${repo}` };
  const changedFiles = changedFilesFromGitHub.map(copyChangedFileSummary);
  const contextFiles: RepositoryContextFile[] = [];
  const budget: Budget = {
    maxChars,
    measureUsedChars: () =>
      measureJsonChars({
        repository,
        pullRequest,
        changedFiles,
        contextFiles,
        detectedLanguages: orderedLanguages(detectedLanguageSet),
        truncated: truncationNotes.length > 0,
        truncationNotes,
      }),
  };

  markIfHighPriorityContentExceedsBudget(budget, truncationNotes);

  applyPatchBudgets(changedFilesFromGitHub, changedFiles, budget, maxPatchChars, truncationNotes, "small");

  await collectRepositoryContextFiles({
    github,
    owner,
    repo,
    ref: pullRequest.summary.baseRef,
    detectedLanguages: detectedLanguageSet,
    contextFiles,
    budget,
    maxRepoContextFileChars,
    truncationNotes,
  });

  for (const contextFile of contextFiles) {
    addRepositoryLanguageEvidence(detectedLanguageSet, contextFile.path);
  }

  applyPatchBudgets(changedFilesFromGitHub, changedFiles, budget, maxPatchChars, truncationNotes, "large");

  const snippetSource = changedFileSnippetSource(pullRequest, owner, repo);

  await collectChangedFileSnippets({
    github,
    owner: snippetSource.owner,
    repo: snippetSource.repo,
    ref: snippetSource.ref,
    changedFiles,
    budget,
    maxSnippetChars: maxRepoContextFileChars,
    truncationNotes,
  });

  const detectedLanguages = orderedLanguages(detectedLanguageSet);
  markFinalSerializedContextOverflow(
    { repository, pullRequest, changedFiles, contextFiles, detectedLanguages, truncationNotes },
    maxChars,
    truncationNotes,
  );

  return {
    repository,
    pullRequest,
    changedFiles,
    contextFiles,
    detectedLanguages,
    truncated: truncationNotes.length > 0,
    truncationNotes,
  };
}

function copyChangedFileSummary(file: ChangedFile): ChangedFile {
  const copy: ChangedFile = { ...file };
  delete copy.patch;
  delete copy.contentSnippet;
  return copy;
}

function applyPatchBudgets(
  sourceFiles: ChangedFile[],
  changedFiles: ChangedFile[],
  budget: Budget,
  maxPatchChars: number,
  truncationNotes: string[],
  size: "small" | "large",
): void {
  const patchFiles = sourceFiles.map((sourceFile, index) => ({ sourceFile, targetFile: changedFiles[index] }));
  const selectedPatchFiles = patchFiles.filter(({ sourceFile }) =>
    size === "small" ? (sourceFile.patch?.length ?? 0) <= maxPatchChars : (sourceFile.patch?.length ?? 0) > maxPatchChars,
  );

  for (const { sourceFile, targetFile } of selectedPatchFiles) {
    applyPatchBudget(sourceFile, targetFile, budget, maxPatchChars, truncationNotes);
  }
}

function applyPatchBudget(
  sourceFile: ChangedFile,
  targetFile: ChangedFile,
  budget: Budget,
  maxPatchChars: number,
  truncationNotes: string[],
): void {
  if (sourceFile.isBinary || sourceFile.patch === undefined) {
    return;
  }

  const truncatedByFileLimit = sourceFile.patch.length > maxPatchChars;
  const skippedNote = `Skipped patch for ${sourceFile.filename} due to context budget limit.`;
  const truncationNote = truncatedByFileLimit
    ? `Patch truncated for ${sourceFile.filename} due to file-size limit.`
    : `Patch truncated for ${sourceFile.filename} due to context budget limit.`;
  const fit = fitTextWithinBudget({
    budget,
    content: sourceFile.patch,
    marker: PATCH_TRUNCATION_MARKER,
    perFileLimit: maxPatchChars,
    apply: (patch) => {
      if (patch === null) {
        delete targetFile.patch;
        return;
      }
      targetFile.patch = patch;
    },
  });

  if (fit.content === null) {
    delete targetFile.patch;
    targetFile.truncated = true;
    truncationNotes.push(skippedNote);
    return;
  }

  targetFile.patch = fit.content;
  if (fit.truncated) {
    targetFile.truncated = true;
    truncationNotes.push(truncationNote);
  }
}

async function collectRepositoryContextFiles(input: {
  github: ContextGitHubClient;
  owner: string;
  repo: string;
  ref: string;
  detectedLanguages: Set<CanonicalLanguage>;
  contextFiles: RepositoryContextFile[];
  budget: Budget;
  maxRepoContextFileChars: number;
  truncationNotes: string[];
}): Promise<RepositoryContextFile[]> {
  const paths = await candidateContextPaths(input.github, input.owner, input.repo, input.ref, input.detectedLanguages);

  for (const path of paths) {
    if (remainingBudget(input.budget) <= 0) {
      input.truncationNotes.push(`Skipped repository context file ${path} due to context budget limit.`);
      break;
    }

    const content = await input.github.getFileContent(input.owner, input.repo, path, input.ref);
    if (content === null || content.length === 0) {
      continue;
    }

    const kind = contextKindForPath(path);
    const contextFile: RepositoryContextFile = { path, kind, content: "", truncated: false };
    const fit = fitTextWithinBudget({
      budget: input.budget,
      content,
      marker: REPO_CONTEXT_TRUNCATION_MARKER,
      perFileLimit: input.maxRepoContextFileChars,
      apply: (storedContent) => {
        const existingIndex = input.contextFiles.indexOf(contextFile);
        if (storedContent === null) {
          if (existingIndex !== -1) {
            input.contextFiles.splice(existingIndex, 1);
          }
          return;
        }

        contextFile.content = storedContent;
        if (existingIndex === -1) {
          input.contextFiles.push(contextFile);
        }
      },
    });

    if (fit.content === null) {
      input.truncationNotes.push(`Skipped repository context file ${path} due to context budget limit.`);
      break;
    }

    contextFile.content = fit.content;
    contextFile.truncated = fit.truncated;
    if (!input.contextFiles.includes(contextFile)) {
      input.contextFiles.push(contextFile);
    }

    if (fit.truncated) {
      input.truncationNotes.push(`Repository context file truncated for ${path} due to file-size limit.`);
    }
  }

  return input.contextFiles;
}

async function collectChangedFileSnippets(input: {
  github: ContextGitHubClient;
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

    const fit = fitTextWithinBudget({
      budget: input.budget,
      content,
      marker: CONTENT_SNIPPET_TRUNCATION_MARKER,
      perFileLimit: input.maxSnippetChars,
      apply: (snippet) => {
        if (snippet === null) {
          delete file.contentSnippet;
          return;
        }
        file.contentSnippet = snippet;
      },
    });

    if (fit.content === null) {
      input.truncationNotes.push(`Skipped changed file content snippet for ${file.filename} due to context budget limit.`);
      break;
    }

    file.contentSnippet = fit.content;
    if (fit.truncated) {
      file.truncated = true;
      input.truncationNotes.push(`Changed file content snippet truncated for ${file.filename} due to file-size limit.`);
    }
  }
}

function changedFileSnippetSource(
  pullRequest: PullRequestDetail,
  fallbackOwner: string,
  fallbackRepo: string,
): { owner: string; repo: string; ref: string } {
  return {
    owner: pullRequest.summary.headRepository?.owner ?? fallbackOwner,
    repo: pullRequest.summary.headRepository?.repo ?? fallbackRepo,
    ref: pullRequest.summary.headSha ?? pullRequest.summary.headRef,
  };
}

async function candidateContextPaths(
  github: ContextGitHubClient,
  owner: string,
  repo: string,
  ref: string,
  detectedLanguages: Set<CanonicalLanguage>,
): Promise<string[]> {
  const paths = new Set<string>(COMMON_CONTEXT_PATHS);
  for (const workflowPath of await workflowContextPaths(github, owner, repo, ref)) {
    paths.add(workflowPath);
  }

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

async function workflowContextPaths(
  github: ContextGitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<string[]> {
  if (!supportsDirectoryListing(github)) {
    return [...FALLBACK_WORKFLOW_CONTEXT_PATHS];
  }

  const paths = await github.listDirectoryFilePaths(owner, repo, ".github/workflows", ref);
  return paths.filter((path) => path.toLowerCase().startsWith(".github/workflows/"));
}

function supportsDirectoryListing(github: ContextGitHubClient): github is ContextGitHubClient & Required<Pick<ContextGitHubClient, "listDirectoryFilePaths">> {
  return typeof github.listDirectoryFilePaths === "function";
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

function fitTextWithinBudget(input: FitTextInput): FitTextResult {
  if (input.content.length <= input.perFileLimit && candidateFitsBudget(input, input.content)) {
    return { content: input.content, truncated: false };
  }

  if (input.perFileLimit < input.marker.length) {
    input.apply(null);
    return { content: null, truncated: true };
  }

  let best: string | null = null;
  let low = 0;
  let high = Math.max(0, input.perFileLimit - input.marker.length - 1);

  while (low <= high) {
    const prefixLength = Math.floor((low + high) / 2);
    const candidate = truncatedText(input.content, prefixLength, input.marker);

    if (candidateFitsBudget(input, candidate)) {
      best = candidate;
      low = prefixLength + 1;
    } else {
      high = prefixLength - 1;
    }
  }

  input.apply(null);
  return { content: best, truncated: true };
}

function candidateFitsBudget(input: FitTextInput, candidate: string): boolean {
  input.apply(candidate);
  const fits = input.budget.measureUsedChars() <= input.budget.maxChars;
  input.apply(null);
  return fits;
}

function truncatedText(content: string, prefixLength: number, marker: string): string {
  if (prefixLength <= 0) {
    return marker;
  }

  return `${content.slice(0, prefixLength)}\n${marker}`;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function remainingBudget(budget: Budget): number {
  return Math.max(0, budget.maxChars - budget.measureUsedChars());
}

function markIfHighPriorityContentExceedsBudget(budget: Budget, truncationNotes: string[]): void {
  if (budget.measureUsedChars() > budget.maxChars) {
    truncationNotes.push("High-priority pull request metadata or file summaries exceed the context budget.");
  }
}

function markFinalSerializedContextOverflow(
  context: Omit<AnalysisContext, "truncated">,
  maxChars: number,
  truncationNotes: string[],
): void {
  const serializedLength = measureJsonChars({ ...context, truncated: truncationNotes.length > 0 });
  if (serializedLength > maxChars) {
    truncationNotes.push("Final serialized analysis context exceeds the context budget.");
  }
}

function measureJsonChars(value: unknown): number {
  return JSON.stringify(value, null, 2).length;
}

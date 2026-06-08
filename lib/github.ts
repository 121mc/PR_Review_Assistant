import { createApiError } from "./errors";
import type { ChangedFile, PullRequestDetail, PullRequestSummary } from "./types";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_ACCEPT = "application/vnd.github+json";
const PAGE_SIZE = 100;

type NotFoundCode = "GITHUB_REPO_NOT_FOUND" | "GITHUB_PR_NOT_FOUND";
type GitHubOperation = "read" | "comment";

interface RequestOptions extends RequestInit {
  notFoundCode: NotFoundCode;
  operation?: GitHubOperation;
}

interface GitHubPullResponse {
  number: number;
  title: string;
  user?: { login?: string | null } | null;
  state: string;
  base?: { ref?: string | null } | null;
  head?: { ref?: string | null } | null;
  updated_at: string;
  html_url: string;
  body?: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  mergeable?: boolean | null;
  draft?: boolean;
}

interface GitHubChangedFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  raw_url?: string;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

interface GitHubDirectoryContentResponse {
  path?: string;
  type?: string;
}

interface GitHubCommentResponse {
  html_url?: string;
}

export class GitHubClient {
  constructor(private readonly token: string) {}

  async listOpenPulls(owner: string, repo: string): Promise<PullRequestSummary[]> {
    const pulls: PullRequestSummary[] = [];
    let page = 1;

    while (true) {
      const pagePulls = await this.requestJson<GitHubPullResponse[]>(
        `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/pulls?state=open&per_page=${PAGE_SIZE}&page=${page}`,
        { notFoundCode: "GITHUB_REPO_NOT_FOUND" },
      );

      pulls.push(...pagePulls.map((pull) => normalizePullSummary(pull, owner, repo)));
      if (pagePulls.length < PAGE_SIZE) {
        return pulls;
      }
      page += 1;
    }
  }

  async getPullDetail(owner: string, repo: string, pullNumber: number): Promise<PullRequestDetail> {
    const pull = await this.requestJson<GitHubPullResponse>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/pulls/${pullNumber}`,
      { notFoundCode: "GITHUB_PR_NOT_FOUND" },
    );

    return {
      summary: normalizePullSummary(pull, owner, repo),
      body: pull.body ?? "",
      additions: pull.additions ?? 0,
      deletions: pull.deletions ?? 0,
      changedFiles: pull.changed_files ?? 0,
      ...(pull.mergeable === null || pull.mergeable === undefined ? {} : { mergeable: pull.mergeable }),
      draft: pull.draft ?? false,
    };
  }

  async listChangedFiles(owner: string, repo: string, pullNumber: number): Promise<ChangedFile[]> {
    const files: ChangedFile[] = [];
    let page = 1;

    while (true) {
      const pageFiles = await this.requestJson<GitHubChangedFileResponse[]>(
        `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/pulls/${pullNumber}/files?per_page=${PAGE_SIZE}&page=${page}`,
        { notFoundCode: "GITHUB_PR_NOT_FOUND" },
      );

      files.push(...pageFiles.map(normalizeChangedFile));
      if (pageFiles.length < PAGE_SIZE) {
        return files;
      }
      page += 1;
    }
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    const response = await fetch(
      `${GITHUB_API_BASE_URL}/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      { headers: this.buildHeaders() },
    );

    if (response.status === 404) {
      return null;
    }
    await this.throwIfNotOk(response, "GITHUB_REPO_NOT_FOUND", "read");

    const payload = (await response.json()) as GitHubContentResponse | GitHubContentResponse[];
    if (Array.isArray(payload) || payload.encoding !== "base64" || typeof payload.content !== "string") {
      return null;
    }

    return decodeTextContent(payload.content);
  }

  async listDirectoryFilePaths(owner: string, repo: string, path: string, ref: string): Promise<string[]> {
    const response = await fetch(
      `${GITHUB_API_BASE_URL}/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      { headers: this.buildHeaders() },
    );

    if (response.status === 404) {
      return [];
    }
    await this.throwIfNotOk(response, "GITHUB_REPO_NOT_FOUND", "read");

    const payload = (await response.json()) as GitHubContentResponse | GitHubDirectoryContentResponse[];
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .filter((item) => item.type === "file" && typeof item.path === "string")
      .map((item) => item.path as string);
  }

  async createPullComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
  ): Promise<{ commentUrl: string }> {
    const comment = await this.requestJson<GitHubCommentResponse>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/issues/${pullNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
        headers: { "Content-Type": "application/json" },
        notFoundCode: "GITHUB_PR_NOT_FOUND",
        operation: "comment",
      },
    );

    return { commentUrl: comment.html_url ?? "" };
  }

  private async requestJson<T>(path: string, options: RequestOptions): Promise<T> {
    const { notFoundCode, operation = "read", headers, ...fetchOptions } = options;
    const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers: this.buildHeaders(headers),
    });

    await this.throwIfNotOk(response, notFoundCode, operation);
    return (await response.json()) as T;
  }

  private buildHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init);
    headers.set("Accept", GITHUB_ACCEPT);

    const token = this.token.trim();
    if (token !== "") {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  }

  private async throwIfNotOk(response: Response, notFoundCode: NotFoundCode, operation: GitHubOperation) {
    if (response.ok) {
      return;
    }

    const githubMessage = await readGitHubErrorMessage(response);
    const code = mapGitHubErrorCode(response, githubMessage, notFoundCode, operation);
    throw createApiError(code, messageForCode(code), { githubMessage }, response.status);
  }
}

function normalizePullSummary(pull: GitHubPullResponse, owner: string, repo: string): PullRequestSummary {
  return {
    owner,
    repo,
    number: pull.number,
    title: pull.title,
    author: pull.user?.login ?? "unknown",
    state: pull.state === "closed" ? "closed" : "open",
    baseRef: pull.base?.ref ?? "",
    headRef: pull.head?.ref ?? "",
    updatedAt: pull.updated_at,
    url: pull.html_url,
  };
}

function normalizeChangedFile(file: GitHubChangedFileResponse): ChangedFile {
  const patch = typeof file.patch === "string" ? file.patch : undefined;

  return {
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    ...(patch === undefined ? {} : { patch }),
    ...(file.raw_url === undefined ? {} : { rawUrl: file.raw_url }),
    isBinary: patch === undefined,
    truncated: false,
  };
}

function decodeTextContent(base64Content: string): string | null {
  const bytes = Buffer.from(base64Content.replace(/\s/g, ""), "base64");
  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }

  if (text.includes("\u0000") || hasHighControlCharacterRatio(text)) {
    return null;
  }

  return text;
}

function hasHighControlCharacterRatio(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  const controlCharacters = Array.from(text).filter((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  }).length;

  return controlCharacters / text.length > 0.1;
}

async function readGitHubErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload) && typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    // Fall through to status text.
  }

  return response.statusText || "GitHub API request failed";
}

function mapGitHubErrorCode(
  response: Response,
  githubMessage: string,
  notFoundCode: NotFoundCode,
  operation: GitHubOperation,
): string {
  if (response.status === 401) {
    return "GITHUB_UNAUTHORIZED";
  }

  if (response.status === 403 || response.status === 429) {
    if (isRateLimited(response, githubMessage)) {
      return "GITHUB_RATE_LIMITED";
    }
    if (operation === "comment" && /locked/i.test(githubMessage)) {
      return "GITHUB_CONVERSATION_LOCKED";
    }
    return "GITHUB_FORBIDDEN";
  }

  if (response.status === 404) {
    return notFoundCode;
  }

  return "GITHUB_API_ERROR";
}

function messageForCode(code: string): string {
  switch (code) {
    case "GITHUB_UNAUTHORIZED":
      return "GitHub token is missing, invalid, or lacks required access.";
    case "GITHUB_FORBIDDEN":
      return "GitHub denied the request. Check repository access and token permissions.";
    case "GITHUB_RATE_LIMITED":
      return "GitHub rate limit exceeded. Try again later or use a token with sufficient quota.";
    case "GITHUB_REPO_NOT_FOUND":
      return "GitHub repository was not found or is not accessible with the provided token.";
    case "GITHUB_PR_NOT_FOUND":
      return "GitHub pull request was not found or is not accessible with the provided token.";
    case "GITHUB_CONVERSATION_LOCKED":
      return "GitHub refused the comment because the conversation is locked.";
    default:
      return "GitHub API request failed.";
  }
}

function isRateLimited(response: Response, githubMessage: string): boolean {
  return response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(githubMessage);
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

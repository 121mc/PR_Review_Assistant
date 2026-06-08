import { parseAnalysisReport } from "./report-schema";
import type { AppConfig } from "./storage";
import type { AnalysisReport, PullRequestDetail, PullRequestSummary } from "./types";
import type { ParsedGitHubUrl } from "./url";

export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly code = "CLIENT_API_ERROR",
    readonly status = 0,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function parseGitHubUrlWithApi(url: string): Promise<ParsedGitHubUrl> {
  const body = await postJson("/api/github/parse-url", { url });
  if (isParsedGitHubUrl(body)) {
    return body;
  }

  throw new ClientApiError("链接格式无效", "INVALID_GITHUB_URL");
}

export async function fetchOpenPullRequests(
  owner: string,
  repo: string,
  githubToken: string,
): Promise<PullRequestSummary[]> {
  const body = await postJson("/api/github/pulls", { owner, repo, githubToken });
  if (!isRecord(body) || !Array.isArray(body.pulls)) {
    throw new ClientApiError("PR 列表响应无效", "GITHUB_RESPONSE_INVALID");
  }

  return body.pulls.map(readPullRequestSummary);
}

export async function fetchPullRequestDetail(
  owner: string,
  repo: string,
  pullNumber: number,
  githubToken: string,
): Promise<PullRequestDetail> {
  const body = await postJson("/api/github/pull-detail", {
    owner,
    repo,
    pullNumber,
    githubToken,
  });
  if (!isRecord(body)) {
    throw new ClientApiError("PR 详情响应无效", "GITHUB_RESPONSE_INVALID");
  }

  return readPullRequestDetail(body.pullRequest);
}

export async function analyzePullRequestWithApi(input: {
  config: AppConfig;
  owner: string;
  repo: string;
  pullNumber: number;
}): Promise<AnalysisReport> {
  const body = await postJson("/api/analyze", {
    owner: input.owner,
    repo: input.repo,
    pullNumber: input.pullNumber,
    githubToken: input.config.githubToken,
    llm: {
      baseUrl: input.config.llmBaseUrl,
      apiKey: input.config.llmApiKey,
      model: input.config.llmModel,
    },
  });

  if (!isRecord(body)) {
    throw new ClientApiError("分析响应无效", "ANALYSIS_RESPONSE_INVALID");
  }

  return parseAnalysisReport(body.report);
}

export async function publishReviewCommentWithApi(input: {
  body: string;
  githubToken: string;
  owner: string;
  pullNumber: number;
  repo: string;
}): Promise<{ commentUrl: string }> {
  const body = await postJson("/api/github/comment", {
    body: input.body,
    githubToken: input.githubToken,
    owner: input.owner,
    pullNumber: input.pullNumber,
    repo: input.repo,
  });

  if (!isRecord(body) || !isString(body.commentUrl)) {
    throw new ClientApiError("评论发布响应无效", "GITHUB_RESPONSE_INVALID");
  }

  return { commentUrl: body.commentUrl };
}

async function postJson(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.code === "string" ? payload.code : "CLIENT_API_ERROR";
    const message = isRecord(payload) && typeof payload.message === "string" ? payload.message : "请求失败";
    throw new ClientApiError(message, code, response.status);
  }

  return payload;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ClientApiError("响应不是有效 JSON", "CLIENT_RESPONSE_INVALID", response.status);
  }
}

function readPullRequestDetail(value: unknown): PullRequestDetail {
  if (!isRecord(value)) {
    throw new ClientApiError("PR 详情响应无效", "GITHUB_RESPONSE_INVALID");
  }

  const summary = readPullRequestSummary(value.summary);
  const detail = value as Record<string, unknown>;
  if (
    typeof detail.body !== "string" ||
    typeof detail.additions !== "number" ||
    typeof detail.deletions !== "number" ||
    typeof detail.changedFiles !== "number" ||
    typeof detail.draft !== "boolean"
  ) {
    throw new ClientApiError("PR 详情字段缺失", "GITHUB_RESPONSE_INVALID");
  }

  return {
    summary,
    body: detail.body,
    additions: detail.additions,
    deletions: detail.deletions,
    changedFiles: detail.changedFiles,
    mergeable: typeof detail.mergeable === "boolean" ? detail.mergeable : undefined,
    draft: detail.draft,
  };
}

function readPullRequestSummary(value: unknown): PullRequestSummary {
  if (!isRecord(value)) {
    throw new ClientApiError("PR 摘要响应无效", "GITHUB_RESPONSE_INVALID");
  }

  if (
    !isString(value.owner) ||
    !isString(value.repo) ||
    !isPositiveSafeInteger(value.number) ||
    !isString(value.title) ||
    !isString(value.author) ||
    (value.state !== "open" && value.state !== "closed") ||
    !isString(value.baseRef) ||
    !isString(value.headRef) ||
    !isString(value.updatedAt) ||
    !isString(value.url)
  ) {
    throw new ClientApiError("PR 摘要字段缺失", "GITHUB_RESPONSE_INVALID");
  }

  return {
    owner: value.owner,
    repo: value.repo,
    number: value.number,
    title: value.title,
    author: value.author,
    state: value.state,
    baseRef: value.baseRef,
    headRef: value.headRef,
    headSha: isString(value.headSha) ? value.headSha : undefined,
    headRepository: isRepositoryRef(value.headRepository) ? value.headRepository : undefined,
    updatedAt: value.updatedAt,
    url: value.url,
  };
}

function isParsedGitHubUrl(value: unknown): value is ParsedGitHubUrl {
  if (!isRecord(value) || !isString(value.owner) || !isString(value.repo)) {
    return false;
  }

  if (value.type === "repo") {
    return true;
  }

  return value.type === "pull" && isPositiveSafeInteger(value.pullNumber);
}

function isRepositoryRef(value: unknown): value is PullRequestSummary["headRepository"] {
  return isRecord(value) && isString(value.owner) && isString(value.repo) && isString(value.url);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

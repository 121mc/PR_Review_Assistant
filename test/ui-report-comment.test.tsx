import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  saveHistoryRecord: vi.fn(),
  useSaveHistoryRecordMock: false,
}));

vi.mock("../lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/storage")>();

  return {
    ...actual,
    saveHistoryRecord: (...args: Parameters<typeof actual.saveHistoryRecord>) =>
      storageMocks.useSaveHistoryRecordMock
        ? storageMocks.saveHistoryRecord(...args)
        : actual.saveHistoryRecord(...args),
  };
});

import HomePage from "../app/page";
import {
  clearHistoryRecords,
  listHistoryRecords,
  saveAppConfig,
  type AppConfig,
} from "../lib/storage";
import type { AnalysisReport, PullRequestDetail, PullRequestSummary } from "../lib/types";
import { validReport } from "./fixtures/report";

const completeConfig: AppConfig = {
  githubToken: "ghp_test",
  llmBaseUrl: "https://llm.test/v1",
  llmApiKey: "sk_test",
  llmModel: "reviewer",
};

const pr42: PullRequestSummary = {
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

const pr42Detail: PullRequestDetail = {
  summary: pr42,
  body: "Fixes a bug",
  additions: 3,
  deletions: 1,
  changedFiles: 1,
  mergeable: true,
  draft: false,
};

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  storageMocks.saveHistoryRecord.mockReset();
  storageMocks.useSaveHistoryRecordMock = false;
  localStorage.clear();
  await clearHistoryRecords();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("report rendering and review comment publishing", () => {
  it("renders a validated report, saves history, and publishes one confirmed GitHub comment", async () => {
    const { fetchMock, user } = await renderAnalyzedReport({ confirmPublish: true });

    expect(screen.getByText("Overall Score")).toBeInTheDocument();
    const dimensionScores = screen.getByLabelText("Dimension Scores");
    expect(within(dimensionScores).getByText("Core Functionality")).toBeInTheDocument();
    expect(within(dimensionScores).getByText("Description Alignment")).toBeInTheDocument();
    expect(within(dimensionScores).getByText("Repository Convention Fit")).toBeInTheDocument();
    expect(within(dimensionScores).getByText("Potential Issues")).toBeInTheDocument();
    expect(within(dimensionScores).getByText("Test Coverage")).toBeInTheDocument();
    expect(within(dimensionScores).getByText("Maintainability")).toBeInTheDocument();

    const savedRecords = await listHistoryRecords();
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0]).toMatchObject({
      repository: { owner: "octo", repo: "repo" },
      pullRequest: { number: 42, title: "Fix bug" },
      report: validReport,
      reviewDraft: { body: validReport.reviewComment },
    });
    expect(savedRecords[0].reviewDraft.sourceReportId).toBe(savedRecords[0].id);

    await user.click(screen.getByRole("button", { name: "发布评论" }));

    expect(await screen.findByText("评论已发布")).toBeInTheDocument();
    const commentCall = fetchMock.mock.calls.find(([endpoint]) => endpoint === "/api/github/comment");
    expect(commentCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(commentCall?.[1]?.body))).toMatchObject({
      body: validReport.reviewComment,
      githubToken: completeConfig.githubToken,
      owner: "octo",
      pullNumber: 42,
      repo: "repo",
    });
  });

  it("renders unsafe markdown as inert content without creating script or onerror image nodes", async () => {
    const unsafeReport: AnalysisReport = {
      ...validReport,
      summary: "Safe summary text.\n\n<script>alert('summary')</script>",
      reviewComment: "Safe review comment.\n\n<script>alert('review')</script>\n<img src=x onerror=alert(1) />",
    };

    await renderAnalyzedReport({ report: unsafeReport });

    expect(screen.getByText("Safe summary text.")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Safe review comment\./)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("shows a visible truncation notice when the report used truncated context", async () => {
    await renderAnalyzedReport({
      report: {
        ...validReport,
        usedTruncatedContext: true,
      },
    });

    expect(screen.getByText(/上下文已被截断/)).toBeInTheDocument();
  });

  it("keeps the draft visible and copyable when publishing fails", async () => {
    const { clipboardWrite, user } = await renderAnalyzedReport({
      commentResponse: jsonResponse({ code: "COMMENT_FAILED", message: "publish rejected" }, 500),
      confirmPublish: true,
    });

    await user.click(screen.getByRole("button", { name: "发布评论" }));

    expect(await screen.findByText("publish rejected")).toBeInTheDocument();
    expectDraftValue(validReport.reviewComment);

    await user.click(screen.getByRole("button", { name: "复制评论" }));
    expect(clipboardWrite).toHaveBeenCalledWith(validReport.reviewComment);
  });

  it("does not call the GitHub comment API when publishing is not confirmed", async () => {
    const { confirmMock, fetchMock, user } = await renderAnalyzedReport({ confirmPublish: false });

    await user.click(screen.getByRole("button", { name: "发布评论" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/github/comment",
      expect.anything(),
    );
    expectDraftValue(validReport.reviewComment);
  });

  it.each([
    ["empty", ""],
    ["unsafe scheme", "javascript:alert(1)"],
  ])("rejects a %s GitHub comment URL response", async (_label, commentUrl) => {
    const { user } = await renderAnalyzedReport({
      commentResponse: jsonResponse({ commentUrl }),
      confirmPublish: true,
    });

    await user.click(screen.getByRole("button", { name: "发布评论" }));

    expect(await screen.findByText("评论发布响应无效")).toBeInTheDocument();
    expect(screen.queryByText("评论已发布")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看 GitHub 评论" })).not.toBeInTheDocument();
    expectDraftValue(validReport.reviewComment);
  });

  it("shows a controlled error and does not call the comment API when confirmation throws", async () => {
    const { confirmMock, fetchMock, user } = await renderAnalyzedReport({
      confirmPublish: () => {
        throw new Error("confirm unavailable");
      },
    });

    await user.click(screen.getByRole("button", { name: "发布评论" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("confirm unavailable")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/github/comment",
      expect.anything(),
    );
    expect(screen.queryByText("评论已发布")).not.toBeInTheDocument();
    expectDraftValue(validReport.reviewComment);
  });

  it("keeps the generated report and draft in memory when history save fails", async () => {
    storageMocks.useSaveHistoryRecordMock = true;
    storageMocks.saveHistoryRecord.mockRejectedValue(new Error("IndexedDB failed"));

    await renderAnalyzedReport();

    expect(await screen.findByText("IndexedDB failed")).toBeInTheDocument();
    expect(screen.getByText("Overall Score")).toBeInTheDocument();
    expectDraftValue(validReport.reviewComment);
    expect(screen.queryByText("分析完成")).not.toBeInTheDocument();
    expect(await listHistoryRecords()).toEqual([]);
  });
});

async function renderAnalyzedReport({
  commentResponse = jsonResponse({ commentUrl: "https://github.com/octo/repo/pull/42#issuecomment-1" }),
  confirmPublish = true,
  report = validReport,
}: {
  commentResponse?: Response;
  confirmPublish?: boolean | (() => boolean);
  report?: AnalysisReport;
} = {}) {
  const user = userEvent.setup();
  const clipboardWrite = stubClipboard();
  const confirmMock = vi.fn(
    typeof confirmPublish === "function" ? confirmPublish : () => confirmPublish,
  );
  vi.stubGlobal("confirm", confirmMock);
  saveAppConfig(completeConfig);
  const fetchMock = stubFetch(async (endpoint) => {
    if (endpoint === "/api/github/parse-url") {
      return jsonResponse({ type: "pull", owner: "octo", repo: "repo", pullNumber: 42 });
    }

    if (endpoint === "/api/github/pull-detail") {
      return jsonResponse({ pullRequest: pr42Detail });
    }

    if (endpoint === "/api/analyze") {
      return jsonResponse({ report });
    }

    if (endpoint === "/api/github/comment") {
      return commentResponse;
    }

    return missingEndpoint(endpoint);
  });

  render(<HomePage />);

  await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/octo/repo/pull/42");
  await user.click(screen.getByRole("button", { name: "加载" }));
  expect(await screen.findByRole("heading", { name: "PR 摘要" })).toBeInTheDocument();

  const analyzeButton = screen.getByRole("button", { name: "开始分析" });
  await waitFor(() => expect(analyzeButton).toBeEnabled());
  await user.click(analyzeButton);
  await screen.findByText("Overall Score");

  return { clipboardWrite, confirmMock, fetchMock, user };
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

function expectDraftValue(body: string): void {
  expect(screen.getByRole("textbox", { name: "评论草稿内容" })).toHaveValue(body);
}

function stubFetch(
  handler: (endpoint: string, body: Record<string, unknown>) => Promise<Response> | Response,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const endpoint = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    return handler(endpoint, body);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function missingEndpoint(endpoint: string): Response {
  return jsonResponse({ code: "UNHANDLED_TEST_ENDPOINT", message: endpoint }, 500);
}

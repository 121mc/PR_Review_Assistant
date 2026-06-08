import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import {
  clearHistoryRecords,
  listHistoryRecords,
  saveAppConfig,
  type AppConfig,
} from "../lib/storage";
import type { PullRequestDetail, PullRequestSummary } from "../lib/types";
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

const pr43: PullRequestSummary = {
  ...pr42,
  number: 43,
  title: "Add docs",
  author: "bob",
  headRef: "docs",
  url: "https://github.com/octo/repo/pull/43",
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
  localStorage.clear();
  await clearHistoryRecords();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PR selection and analysis flow", () => {
  it("loads open pull requests from a repository URL", async () => {
    const user = userEvent.setup();
    saveAppConfig(completeConfig);
    const fetchMock = stubFetch(async (endpoint) => {
      if (endpoint === "/api/github/parse-url") {
        return jsonResponse({ type: "repo", owner: "octo", repo: "repo" });
      }

      if (endpoint === "/api/github/pulls") {
        return jsonResponse({ pulls: [pr42] });
      }

      return missingEndpoint(endpoint);
    });

    render(<HomePage />);

    await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/octo/repo");
    await user.click(screen.getByRole("button", { name: "加载" }));

    expect(await screen.findByText("#42 Fix bug")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/github/parse-url",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/github/pulls",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("loads a direct PR summary from a pull request URL", async () => {
    const user = userEvent.setup();
    saveAppConfig(completeConfig);
    const fetchMock = stubFetch(async (endpoint) => {
      if (endpoint === "/api/github/parse-url") {
        return jsonResponse({ type: "pull", owner: "octo", repo: "repo", pullNumber: 42 });
      }

      if (endpoint === "/api/github/pull-detail") {
        return jsonResponse({ pullRequest: pr42Detail });
      }

      return missingEndpoint(endpoint);
    });

    render(<HomePage />);

    await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/octo/repo/pull/42");
    await user.click(screen.getByRole("button", { name: "加载" }));

    expect(await screen.findByRole("heading", { name: "PR 摘要" })).toBeInTheDocument();
    expect(screen.getByText("#42 Fix bug")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("1 个文件")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/github/pull-detail",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("enables analysis only after config and PR target are ready, then saves a completed report", async () => {
    const user = userEvent.setup();
    let resolveAnalyze: (response: Response) => void = () => {};
    const analyzeResponse = new Promise<Response>((resolve) => {
      resolveAnalyze = resolve;
    });
    const fetchMock = stubFetch(async (endpoint) => {
      if (endpoint === "/api/github/parse-url") {
        return jsonResponse({ type: "repo", owner: "octo", repo: "repo" });
      }

      if (endpoint === "/api/github/pulls") {
        return jsonResponse({ pulls: [pr42] });
      }

      if (endpoint === "/api/analyze") {
        return analyzeResponse;
      }

      return missingEndpoint(endpoint);
    });

    render(<HomePage />);

    const analyzeButton = screen.getByRole("button", { name: "开始分析" });
    expect(analyzeButton).toBeDisabled();

    await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/octo/repo");
    await user.click(screen.getByRole("button", { name: "加载" }));
    await user.click(await screen.findByRole("button", { name: "选择 #42 Fix bug" }));
    expect(analyzeButton).toBeDisabled();

    await user.type(screen.getByLabelText("GitHub Token"), completeConfig.githubToken);
    await user.type(screen.getByLabelText("LLM Base URL"), completeConfig.llmBaseUrl);
    await user.type(screen.getByLabelText("LLM API Key"), completeConfig.llmApiKey);
    await user.type(screen.getByLabelText("模型"), completeConfig.llmModel);
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => expect(analyzeButton).toBeEnabled());
    await user.click(analyzeButton);

    expect(screen.getByText("获取 PR")).toBeInTheDocument();
    expect(screen.getByText("收集上下文")).toBeInTheDocument();
    expect(screen.getByText("调用 LLM")).toBeInTheDocument();
    expect(screen.getByText("验证报告")).toBeInTheDocument();
    expect(screen.getByText("保存历史")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在分析" })).toBeDisabled();

    resolveAnalyze(jsonResponse({ report: validReport }));

    expect(await screen.findByText("分析完成")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analyze",
      expect.objectContaining({ method: "POST" }),
    );
    await expect(listHistoryRecords()).resolves.toMatchObject([
      {
        repository: { owner: "octo", repo: "repo" },
        pullRequest: { number: 42, title: "Fix bug" },
        report: validReport,
      },
    ]);
  });

  it("filters the pull request list by title and number", async () => {
    const user = userEvent.setup();
    saveAppConfig(completeConfig);
    stubFetch(async (endpoint) => {
      if (endpoint === "/api/github/parse-url") {
        return jsonResponse({ type: "repo", owner: "octo", repo: "repo" });
      }

      if (endpoint === "/api/github/pulls") {
        return jsonResponse({ pulls: [pr42, pr43] });
      }

      return missingEndpoint(endpoint);
    });

    render(<HomePage />);

    await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/octo/repo");
    await user.click(screen.getByRole("button", { name: "加载" }));
    const list = await screen.findByRole("list", { name: "开放 PR" });
    expect(within(list).getByText("#42 Fix bug")).toBeInTheDocument();
    expect(within(list).getByText("#43 Add docs")).toBeInTheDocument();

    await user.type(screen.getByLabelText("筛选 PR"), "43");

    expect(within(list).queryByText("#42 Fix bug")).not.toBeInTheDocument();
    expect(within(list).getByText("#43 Add docs")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("筛选 PR"));
    await user.type(screen.getByLabelText("筛选 PR"), "fix");

    expect(within(list).getByText("#42 Fix bug")).toBeInTheDocument();
    expect(within(list).queryByText("#43 Add docs")).not.toBeInTheDocument();
  });

  it("resets URL parse errors to idle when the URL is edited and then loads a valid repo", async () => {
    const user = userEvent.setup();
    saveAppConfig(completeConfig);
    const fetchMock = stubFetch(async (endpoint, body) => {
      if (endpoint === "/api/github/parse-url" && body.url === "not-a-url") {
        return jsonResponse({ code: "INVALID_GITHUB_URL", message: "Invalid GitHub URL" }, 400);
      }

      if (endpoint === "/api/github/parse-url") {
        return jsonResponse({ type: "repo", owner: "octo", repo: "repo" });
      }

      if (endpoint === "/api/github/pulls") {
        return jsonResponse({ pulls: [pr42] });
      }

      return missingEndpoint(endpoint);
    });

    render(<HomePage />);

    const input = screen.getByLabelText("GitHub 链接");
    await user.type(input, "not-a-url");
    await user.click(screen.getByRole("button", { name: "加载" }));
    expect(await screen.findByText("链接格式无效")).toBeInTheDocument();
    expect(screen.getByText("待加载链接")).toBeInTheDocument();

    await user.clear(input);
    expect(screen.queryByText("链接格式无效")).not.toBeInTheDocument();

    await user.type(input, "https://github.com/octo/repo");
    await user.click(screen.getByRole("button", { name: "加载" }));

    expect(await screen.findByText("#42 Fix bug")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

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

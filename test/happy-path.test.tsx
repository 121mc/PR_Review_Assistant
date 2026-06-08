import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { clearHistoryRecords, listHistoryRecords } from "../lib/storage";
import { validReport } from "./fixtures/report";

const pullSummary = {
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

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  await clearHistoryRecords();
  localStorage.setItem(
    "pr-manager-config",
    JSON.stringify({
      githubToken: "ghp_test",
      llmBaseUrl: "https://llm.test/v1",
      llmApiKey: "sk_test",
      llmModel: "model-a",
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("happy path", () => {
  it("loads a repository, selects a PR, analyzes it, renders the report, and saves history", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(async (endpoint) => {
      if (endpoint === "/api/github/parse-url") {
        return jsonResponse({ type: "repo", owner: "octo", repo: "repo" });
      }

      if (endpoint === "/api/github/pulls") {
        return jsonResponse({ pulls: [pullSummary] });
      }

      if (endpoint === "/api/github/pull-detail") {
        return jsonResponse({ pullRequest: pullSummary });
      }

      if (endpoint === "/api/analyze") {
        return jsonResponse({ report: validReport });
      }

      return jsonResponse({ code: "UNHANDLED_TEST_ENDPOINT", message: endpoint }, 500);
    });

    render(<HomePage />);

    await user.type(screen.getByLabelText("GitHub 链接"), "https://github.com/octo/repo");
    await user.click(screen.getByRole("button", { name: "加载" }));
    await user.click(await screen.findByRole("button", { name: /#42 Fix bug/ }));

    const analyzeButton = screen.getByRole("button", { name: "开始分析" });
    await waitFor(() => expect(analyzeButton).toBeEnabled());
    await user.click(analyzeButton);

    await waitFor(() => expect(screen.getByText("Overall Score")).toBeInTheDocument());
    await waitFor(async () => {
      expect(await listHistoryRecords()).toHaveLength(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analyze",
      expect.objectContaining({ method: "POST" }),
    );
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

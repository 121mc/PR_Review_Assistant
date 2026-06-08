import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import {
  clearHistoryRecords,
  listHistoryRecords,
  loadAppConfig,
  saveHistoryRecord,
} from "../lib/storage";
import type { HistoryRecord } from "../lib/types";
import { validReport } from "./fixtures/report";

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  await clearHistoryRecords();
});

afterEach(() => {
  cleanup();
});

function historyRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  const id = overrides.id ?? "record-1";

  return {
    id,
    createdAt: "2026-06-08T00:00:00Z",
    repository: { owner: "octo", repo: "repo", url: "https://github.com/octo/repo" },
    pullRequest: {
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
    },
    report: validReport,
    reviewDraft: { body: validReport.reviewComment, sourceReportId: id },
    contextSummary: { changedFileCount: 1, contextFileCount: 2, truncated: false },
    ...overrides,
  };
}

describe("dashboard shell", () => {
  it("saves settings from the Chinese settings panel", async () => {
    render(<HomePage />);
    await userEvent.type(screen.getByLabelText("GitHub Token"), "ghp_test");
    await userEvent.type(screen.getByLabelText("LLM Base URL"), "https://llm.test/v1");
    await userEvent.type(screen.getByLabelText("LLM API Key"), "sk_test");
    await userEvent.type(screen.getByLabelText("模型"), "model-a");
    await userEvent.click(screen.getByRole("button", { name: "保存配置" }));
    expect(loadAppConfig()?.llmModel).toBe("model-a");
  });

  it("shows the link input workspace", () => {
    render(<HomePage />);
    expect(screen.getByLabelText("GitHub 链接")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载" })).toBeInTheDocument();
  });

  it("does not read browser storage during initial render", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    render(<HomePage />);
    expect(getItemSpy).not.toHaveBeenCalled();
  });

  it("loads saved config after client effects run", async () => {
    localStorage.setItem(
      "pr-manager-config",
      JSON.stringify({
        githubToken: "ghp_test",
        llmBaseUrl: "https://llm.test/v1",
        llmApiKey: "sk_test",
        llmModel: "model-a",
      }),
    );
    render(<HomePage />);
    await waitFor(() => expect(screen.getByDisplayValue("model-a")).toBeInTheDocument());
  });

  it("expands the settings panel when config is incomplete", async () => {
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "基础配置" })).toHaveAttribute("aria-expanded", "true"),
    );
  });

  it("accepts repository and pull request GitHub links", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    const input = screen.getByLabelText("GitHub 链接");
    await user.type(input, "https://github.com/octo/repo");
    await user.click(screen.getByRole("button", { name: "加载" }));
    expect(screen.getByRole("status")).toHaveTextContent("已识别仓库链接");

    await user.clear(input);
    await user.type(input, "https://github.com/octo/repo/pull/42");
    await user.click(screen.getByRole("button", { name: "加载" }));
    expect(screen.getByRole("status")).toHaveTextContent("已识别 PR 链接");
  });

  it("lists history records from IndexedDB", async () => {
    await saveHistoryRecord(
      historyRecord({
        id: "older",
        createdAt: "2026-06-07T00:00:00Z",
        pullRequest: {
          ...historyRecord().pullRequest,
          number: 1,
          title: "Older PR",
          url: "https://github.com/octo/repo/pull/1",
        },
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "older" },
      }),
    );
    await saveHistoryRecord(
      historyRecord({
        id: "newer",
        createdAt: "2026-06-09T00:00:00Z",
        pullRequest: {
          ...historyRecord().pullRequest,
          number: 2,
          title: "Newer PR",
          url: "https://github.com/octo/repo/pull/2",
        },
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "newer" },
      }),
    );

    render(<HomePage />);

    const historyList = await screen.findByRole("list", { name: "历史记录" });
    await waitFor(() => expect(within(historyList).getByText("Newer PR")).toBeInTheDocument());
    const items = within(historyList).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Newer PR");
    expect(items[1]).toHaveTextContent("Older PR");
  });

  it("deletes one history record", async () => {
    const user = userEvent.setup();
    await saveHistoryRecord(
      historyRecord({
        id: "record-delete",
        pullRequest: { ...historyRecord().pullRequest, title: "Delete me" },
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "record-delete" },
      }),
    );

    render(<HomePage />);

    await screen.findByText("Delete me");
    await user.click(screen.getByRole("button", { name: "删除 Delete me" }));

    await waitFor(() => expect(screen.queryByText("Delete me")).not.toBeInTheDocument());
    expect(await listHistoryRecords()).toEqual([]);
  });

  it("clears all history records", async () => {
    const user = userEvent.setup();
    await saveHistoryRecord(historyRecord({ id: "record-1" }));
    await saveHistoryRecord(
      historyRecord({
        id: "record-2",
        pullRequest: { ...historyRecord().pullRequest, title: "Second PR" },
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "record-2" },
      }),
    );

    render(<HomePage />);

    await screen.findByText("Second PR");
    await user.click(screen.getByRole("button", { name: "清空历史" }));

    await waitFor(() => expect(screen.queryByText("Second PR")).not.toBeInTheDocument());
    expect(screen.getByText("暂无历史记录")).toBeInTheDocument();
    expect(await listHistoryRecords()).toEqual([]);
  });
});

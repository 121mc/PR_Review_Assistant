import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  clearHistoryRecords: vi.fn(),
  deleteHistoryRecord: vi.fn(),
  useClearHistoryRecordsMock: false,
  useDeleteHistoryRecordMock: false,
}));

vi.mock("../lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/storage")>();

  return {
    ...actual,
    clearHistoryRecords: (...args: Parameters<typeof actual.clearHistoryRecords>) =>
      storageMocks.useClearHistoryRecordsMock
        ? storageMocks.clearHistoryRecords(...args)
        : actual.clearHistoryRecords(...args),
    deleteHistoryRecord: (...args: Parameters<typeof actual.deleteHistoryRecord>) =>
      storageMocks.useDeleteHistoryRecordMock
        ? storageMocks.deleteHistoryRecord(...args)
        : actual.deleteHistoryRecord(...args),
  };
});

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
  storageMocks.clearHistoryRecords.mockReset();
  storageMocks.deleteHistoryRecord.mockReset();
  storageMocks.useClearHistoryRecordsMock = false;
  storageMocks.useDeleteHistoryRecordMock = false;
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

  it("shows a Chinese error when saved settings cannot be loaded", async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(<HomePage />);

    expect(getItemSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("配置加载失败"));
    expect(screen.getByLabelText("GitHub Token")).toBeInTheDocument();
  });

  it("shows a Chinese error when settings cannot be saved", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(<HomePage />);

    await user.type(screen.getByLabelText("GitHub Token"), "ghp_test");
    await user.type(screen.getByLabelText("LLM Base URL"), "https://llm.test/v1");
    await user.type(screen.getByLabelText("LLM API Key"), "sk_test");
    await user.type(screen.getByLabelText("模型"), "model-a");
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    expect(screen.getByRole("status")).toHaveTextContent("配置保存失败");
    expect(screen.getByDisplayValue("model-a")).toBeInTheDocument();
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

  it("shows the explicit Chinese link error for malformed input", async () => {
    const user = userEvent.setup();

    render(<HomePage />);

    await user.type(screen.getByLabelText("GitHub 链接"), "abc");
    await user.click(screen.getByRole("button", { name: "加载" }));

    expect(screen.getByRole("status")).toHaveTextContent("链接格式无效");
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
    await user.click(screen.getByRole("button", { name: "删除 octo/repo #42 Delete me" }));

    await waitFor(() => expect(screen.queryByText("Delete me")).not.toBeInTheDocument());
    expect(await listHistoryRecords()).toEqual([]);
  });

  it("shows a Chinese error when deleting a history record fails", async () => {
    const user = userEvent.setup();
    storageMocks.useDeleteHistoryRecordMock = true;
    storageMocks.deleteHistoryRecord.mockRejectedValue(new Error("delete failed"));
    await saveHistoryRecord(
      historyRecord({
        id: "record-delete-error",
        pullRequest: { ...historyRecord().pullRequest, title: "Keep me" },
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "record-delete-error" },
      }),
    );

    render(<HomePage />);

    await screen.findByText("Keep me");
    await user.click(screen.getByRole("button", { name: "删除 octo/repo #42 Keep me" }));

    expect(await screen.findByRole("status")).toHaveTextContent("历史记录删除失败");
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(await listHistoryRecords()).toHaveLength(1);
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

  it("shows a Chinese error when clearing history records fails", async () => {
    const user = userEvent.setup();
    storageMocks.useClearHistoryRecordsMock = true;
    storageMocks.clearHistoryRecords.mockRejectedValue(new Error("clear failed"));
    await saveHistoryRecord(historyRecord({ id: "record-1" }));
    await saveHistoryRecord(
      historyRecord({
        id: "record-2",
        pullRequest: { ...historyRecord().pullRequest, title: "Still here" },
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "record-2" },
      }),
    );

    render(<HomePage />);

    await screen.findByText("Still here");
    await user.click(screen.getByRole("button", { name: "清空历史" }));

    expect(await screen.findByRole("status")).toHaveTextContent("历史记录清空失败");
    expect(screen.getByText("Still here")).toBeInTheDocument();
    expect(await listHistoryRecords()).toHaveLength(2);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../lib/storage";
import {
  clearHistoryRecords,
  deleteHistoryRecord,
  getHistoryRecord,
  hasCompleteConfig,
  listHistoryRecords,
  loadAppConfig,
  saveAppConfig,
  saveHistoryRecord,
} from "../lib/storage";
import type { HistoryRecord } from "../lib/types";
import { validReport } from "./fixtures/report";

const configStorageKey = "pr-manager-config";

const completeConfig: AppConfig = {
  githubToken: "ghp_test",
  llmBaseUrl: "https://llm.test/v1",
  llmApiKey: "sk_test",
  llmModel: "model-a",
};

function historyRecord(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: "record-1",
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
    reviewDraft: { body: validReport.reviewComment, sourceReportId: "record-1" },
    contextSummary: { changedFileCount: 1, contextFileCount: 2, truncated: false },
    ...overrides,
  };
}

beforeEach(async () => {
  localStorage.clear();
  await clearHistoryRecords();
});

describe("storage", () => {
  it("saves and loads app config from localStorage", () => {
    saveAppConfig(completeConfig);

    expect(loadAppConfig()).toEqual(completeConfig);
  });

  it("removes malformed config JSON and returns undefined", () => {
    localStorage.setItem(configStorageKey, "{not-json");

    expect(loadAppConfig()).toBeUndefined();
    expect(localStorage.getItem(configStorageKey)).toBeNull();
  });

  it("removes valid JSON with an invalid config shape and returns undefined", () => {
    localStorage.setItem(
      configStorageKey,
      JSON.stringify({
        githubToken: 42,
        llmBaseUrl: "https://llm.test/v1",
        llmApiKey: "sk_test",
        llmModel: "model-a",
      }),
    );

    expect(loadAppConfig()).toBeUndefined();
    expect(localStorage.getItem(configStorageKey)).toBeNull();
  });

  it("checks whether app config has all required fields", () => {
    expect(hasCompleteConfig(undefined)).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, githubToken: "" })).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, llmBaseUrl: "" })).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, llmApiKey: "" })).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, llmModel: "" })).toBe(false);
    expect(hasCompleteConfig(completeConfig)).toBe(true);
  });

  it("treats whitespace-only and non-string config fields as incomplete", () => {
    expect(hasCompleteConfig({ ...completeConfig, githubToken: "   " })).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, llmBaseUrl: "\n\t" })).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, llmApiKey: "   " })).toBe(false);
    expect(hasCompleteConfig({ ...completeConfig, llmModel: "   " })).toBe(false);
    expect(
      hasCompleteConfig({
        githubToken: "ghp_test",
        llmBaseUrl: "https://llm.test/v1",
        llmApiKey: 123,
        llmModel: "model-a",
      } as unknown as Partial<AppConfig>),
    ).toBe(false);
  });

  it("saves full history records in IndexedDB", async () => {
    await saveHistoryRecord(historyRecord());

    const records = await listHistoryRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(historyRecord());
    expect(records[0].report.reviewComment).toContain("Review");
  });

  it("lists history records by createdAt descending", async () => {
    await saveHistoryRecord(
      historyRecord({
        id: "a-older",
        createdAt: "2026-06-07T00:00:00Z",
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "a-older" },
      }),
    );
    await saveHistoryRecord(
      historyRecord({
        id: "z-newer",
        createdAt: "2026-06-09T00:00:00Z",
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "z-newer" },
      }),
    );

    expect((await listHistoryRecords()).map((record) => record.id)).toEqual(["z-newer", "a-older"]);
  });

  it("gets and deletes a history record by id", async () => {
    await saveHistoryRecord(historyRecord());

    expect(await getHistoryRecord("record-1")).toEqual(historyRecord());
    await deleteHistoryRecord("record-1");

    expect(await getHistoryRecord("record-1")).toBeUndefined();
    expect(await listHistoryRecords()).toEqual([]);
  });

  it("clears all history records", async () => {
    await saveHistoryRecord(historyRecord({ id: "record-1" }));
    await saveHistoryRecord(
      historyRecord({
        id: "record-2",
        reviewDraft: { body: validReport.reviewComment, sourceReportId: "record-2" },
      }),
    );

    await clearHistoryRecords();

    expect(await listHistoryRecords()).toEqual([]);
  });

  it("rejects history records containing secret-looking keys anywhere", async () => {
    await expect(
      saveHistoryRecord({
        ...historyRecord(),
        report: {
          ...validReport,
          scores: {
            ...validReport.scores,
            coreFunctionality: {
              ...validReport.scores.coreFunctionality,
              evidence: [{ githubToken: "ghp_secret" }],
            },
          },
        },
      } as unknown as HistoryRecord),
    ).rejects.toThrow(/secret/i);

    await expect(
      saveHistoryRecord({
        ...historyRecord({ id: "record-2" }),
        contextSummary: {
          changedFileCount: 1,
          contextFileCount: 2,
          truncated: false,
          headers: { authorization: "Bearer abc" },
        },
      } as unknown as HistoryRecord),
    ).rejects.toThrow(/secret/i);

    expect(await listHistoryRecords()).toEqual([]);
  });
});

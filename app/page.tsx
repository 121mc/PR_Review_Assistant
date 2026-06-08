"use client";

import { Play } from "lucide-react";
import { useCallback, useState } from "react";
import { AnalysisProgress, type AnalysisStage } from "../components/AnalysisProgress";
import { HistoryPanel } from "../components/HistoryPanel";
import { LinkInput } from "../components/LinkInput";
import { PullRequestPicker } from "../components/PullRequestPicker";
import { PullRequestSummary } from "../components/PullRequestSummary";
import { SettingsPanel } from "../components/SettingsPanel";
import {
  analyzePullRequestWithApi,
  ClientApiError,
  fetchOpenPullRequests,
  fetchPullRequestDetail,
  parseGitHubUrlWithApi,
} from "../lib/client-api";
import {
  type AppConfig,
  hasCompleteConfig,
  saveHistoryRecord,
} from "../lib/storage";
import type {
  AnalysisReport,
  HistoryRecord,
  PullRequestDetail,
  PullRequestSummary as PullRequestSummaryData,
  RepositoryRef,
} from "../lib/types";
import type { ParsedGitHubUrl } from "../lib/url";

type FlowStatus = "idle" | "loading" | "repoLoaded" | "prReady" | "analyzing" | "done" | "error";
type ErrorSource = "parse" | "github" | "analysis" | "storage";
type SelectedPullRequest = PullRequestDetail | PullRequestSummaryData;

type LinkStatus =
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

const emptyConfig: AppConfig = {
  githubToken: "",
  llmBaseUrl: "",
  llmApiKey: "",
  llmModel: "",
};

export default function HomePage() {
  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [repository, setRepository] = useState<RepositoryRef | null>(null);
  const [pullRequests, setPullRequests] = useState<PullRequestSummaryData[]>([]);
  const [selectedPullRequest, setSelectedPullRequest] = useState<SelectedPullRequest | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<ErrorSource | null>(null);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage | undefined>();
  const [report, setReport] = useState<AnalysisReport | null>(null);

  const selectedSummary = selectedPullRequest ? getPullRequestSummary(selectedPullRequest) : null;
  const configComplete = hasCompleteConfig(config);
  const canAnalyze = configComplete && selectedSummary !== null && flowStatus !== "analyzing";

  const handleConfigChange = useCallback(
    (nextConfig: AppConfig) => {
      setConfig(nextConfig);

      if (flowStatus !== "error") {
        return;
      }

      setErrorMessage(null);
      setErrorSource(null);

      if (selectedPullRequest) {
        setFlowStatus("prReady");
      } else if (repository || pullRequests.length > 0) {
        setFlowStatus("repoLoaded");
      } else {
        setFlowStatus("idle");
      }
    },
    [flowStatus, pullRequests.length, repository, selectedPullRequest],
  );

  async function handleLinkSubmit(rawUrl: string): Promise<LinkStatus> {
    setErrorMessage(null);
    setErrorSource(null);
    setReport(null);
    setAnalysisStage(undefined);
    setFlowStatus("loading");

    const parsed = await parseUrlForFlow(rawUrl);
    if (!parsed) {
      clearPullRequestFlow();
      setFlowStatus("error");
      setErrorSource("parse");
      setErrorMessage("链接解析失败");
      return { tone: "error", message: "链接格式无效" };
    }

    try {
      if (parsed.type === "repo") {
        const nextRepository = toRepositoryRef(parsed.owner, parsed.repo);
        const pulls = await fetchOpenPullRequests(
          parsed.owner,
          parsed.repo,
          config.githubToken,
        );
        setRepository(nextRepository);
        setPullRequests(pulls);
        setSelectedPullRequest(null);
        setFlowStatus("repoLoaded");
        return { tone: "success", message: "已识别仓库链接" };
      }

      const pullRequest = await fetchPullRequestDetail(
        parsed.owner,
        parsed.repo,
        parsed.pullNumber,
        config.githubToken,
      );
      setRepository(toRepositoryRef(parsed.owner, parsed.repo));
      setPullRequests([]);
      setSelectedPullRequest(pullRequest);
      setFlowStatus("prReady");
      return { tone: "success", message: "已识别 PR 链接" };
    } catch (error) {
      setFlowStatus("error");
      setErrorSource("github");
      setErrorMessage(readErrorMessage(error, "GitHub 加载失败"));
      return { tone: "error", message: "GitHub 加载失败" };
    }
  }

  function handleUrlChange() {
    if (flowStatus !== "error") {
      return;
    }

    if (errorSource === "parse") {
      clearPullRequestFlow();
      setFlowStatus("idle");
    } else if (selectedPullRequest) {
      setFlowStatus("prReady");
    } else if (repository) {
      setFlowStatus("repoLoaded");
    } else {
      setFlowStatus("idle");
    }

    setErrorMessage(null);
    setErrorSource(null);
  }

  function clearPullRequestFlow() {
    setRepository(null);
    setPullRequests([]);
    setSelectedPullRequest(null);
    setReport(null);
    setAnalysisStage(undefined);
  }

  function handlePullRequestSelect(pullRequest: PullRequestSummaryData) {
    setSelectedPullRequest(pullRequest);
    setReport(null);
    setAnalysisStage(undefined);
    setErrorMessage(null);
    setErrorSource(null);
    setFlowStatus("prReady");
  }

  async function handleAnalyze() {
    if (!configComplete || !selectedSummary) {
      return;
    }

    setFlowStatus("analyzing");
    setErrorMessage(null);
    setErrorSource(null);
    setReport(null);
    setAnalysisStage("fetching-pr");

    try {
      setAnalysisStage("collecting-context");
      setAnalysisStage("calling-llm");
      const nextReport = await analyzePullRequestWithApi({
        config,
        owner: selectedSummary.owner,
        repo: selectedSummary.repo,
        pullNumber: selectedSummary.number,
      });
      setAnalysisStage("validating-report");
      setReport(nextReport);
      setAnalysisStage("saving-history");
      await saveHistoryRecord(createHistoryRecord(repository, selectedSummary, selectedPullRequest, nextReport));
      setFlowStatus("done");
    } catch (error) {
      setFlowStatus("error");
      setErrorSource(error instanceof ClientApiError ? "analysis" : "storage");
      setErrorMessage(readErrorMessage(error, "分析失败"));
    }
  }

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-rows-[auto_1fr]">
        <header className="border-b border-neutral-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">PR 管理器</h1>
              <p className="mt-1 text-sm text-neutral-500">本地审查工作台</p>
            </div>
            <div className="text-xs text-neutral-500">本地配置</div>
          </div>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 gap-4">
            <SettingsPanel onConfigChange={handleConfigChange} />
            <LinkInput busy={flowStatus === "loading"} onChange={handleUrlChange} onSubmit={handleLinkSubmit} />
            {flowStatus === "repoLoaded" || pullRequests.length > 0 ? (
              <PullRequestPicker
                onSelect={handlePullRequestSelect}
                pullRequests={pullRequests}
                selectedNumber={selectedSummary?.number}
              />
            ) : null}
            {selectedPullRequest ? <PullRequestSummary pullRequest={selectedPullRequest} /> : null}
            {flowStatus === "analyzing" || flowStatus === "done" ? (
              <AnalysisProgress currentStage={analysisStage} done={flowStatus === "done"} />
            ) : null}
            <section aria-labelledby="status-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
              <h2 className="text-sm font-semibold text-neutral-950" id="status-heading">
                状态
              </h2>
              <div className="mt-4 grid divide-y divide-neutral-200 border-y border-neutral-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="py-3 sm:pr-4">
                  <p className="text-xs text-neutral-500">仓库状态</p>
                  <p className="mt-1 text-sm font-medium text-neutral-950">{repositoryStatusText(flowStatus, repository, pullRequests, selectedSummary)}</p>
                </div>
                <div className="py-3 sm:pl-4">
                  <p className="text-xs text-neutral-500">报告状态</p>
                  <p className="mt-1 text-sm font-medium text-neutral-950">{reportStatusText(flowStatus, report)}</p>
                </div>
              </div>
              {errorMessage ? (
                <p aria-live="polite" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorMessage}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!canAnalyze}
                  onClick={() => void handleAnalyze()}
                  type="button"
                >
                  <Play aria-hidden="true" className="h-4 w-4" />
                  {flowStatus === "analyzing" ? "正在分析" : "开始分析"}
                </button>
                <p className="text-xs text-neutral-500">{analysisHint(configComplete, selectedSummary)}</p>
              </div>
            </section>
          </div>

          <aside>
            <HistoryPanel />
          </aside>
        </div>
      </div>
    </main>
  );
}

async function parseUrlForFlow(
  rawUrl: string,
): Promise<ParsedGitHubUrl | null> {
  try {
    return await parseGitHubUrlWithApi(rawUrl);
  } catch {
    return null;
  }
}

function getPullRequestSummary(pullRequest: SelectedPullRequest): PullRequestSummaryData {
  return "summary" in pullRequest ? pullRequest.summary : pullRequest;
}

function toRepositoryRef(owner: string, repo: string): RepositoryRef {
  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}

function createHistoryRecord(
  repository: RepositoryRef | null,
  summary: PullRequestSummaryData,
  selectedPullRequest: SelectedPullRequest | null,
  report: AnalysisReport,
): HistoryRecord {
  const id = createHistoryId(summary);
  const detail = selectedPullRequest && "summary" in selectedPullRequest ? selectedPullRequest : undefined;

  return {
    id,
    createdAt: new Date().toISOString(),
    repository: repository ?? toRepositoryRef(summary.owner, summary.repo),
    pullRequest: summary,
    report,
    reviewDraft: {
      body: report.reviewComment,
      sourceReportId: id,
    },
    contextSummary: {
      changedFileCount: detail?.changedFiles ?? 0,
      contextFileCount: 0,
      truncated: report.usedTruncatedContext,
    },
  };
}

function createHistoryId(summary: PullRequestSummaryData): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${summary.owner}-${summary.repo}-${summary.number}-${Date.now()}`;
}

function repositoryStatusText(
  flowStatus: FlowStatus,
  repository: RepositoryRef | null,
  pullRequests: PullRequestSummaryData[],
  selectedSummary: PullRequestSummaryData | null,
): string {
  if (flowStatus === "loading") {
    return "加载中";
  }

  if (selectedSummary) {
    return `${selectedSummary.owner}/${selectedSummary.repo} #${selectedSummary.number}`;
  }

  if (repository) {
    return `${repository.owner}/${repository.repo} · ${pullRequests.length} 个开放 PR`;
  }

  return "待加载链接";
}

function reportStatusText(flowStatus: FlowStatus, report: AnalysisReport | null): string {
  if (flowStatus === "analyzing") {
    return "分析中";
  }

  if (flowStatus === "done" && report) {
    return "报告已生成";
  }

  return "待生成报告";
}

function analysisHint(configComplete: boolean, selectedSummary: PullRequestSummaryData | null): string {
  if (!configComplete) {
    return "补全配置后可分析";
  }

  if (!selectedSummary) {
    return "选择 PR 后可分析";
  }

  return "将调用本地分析接口并保存历史";
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return fallback;
}

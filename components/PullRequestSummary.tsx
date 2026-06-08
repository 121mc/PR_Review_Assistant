"use client";

import { GitBranch, User } from "lucide-react";
import type {
  PullRequestDetail,
  PullRequestSummary as PullRequestSummaryData,
} from "../lib/types";

interface PullRequestSummaryProps {
  pullRequest: PullRequestDetail | PullRequestSummaryData;
}

export function PullRequestSummary({ pullRequest }: PullRequestSummaryProps) {
  const summary = "summary" in pullRequest ? pullRequest.summary : pullRequest;
  const detail = "summary" in pullRequest ? pullRequest : undefined;

  return (
    <section aria-labelledby="pull-summary-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950" id="pull-summary-heading">
            PR 摘要
          </h2>
          <p className="mt-2 text-lg font-semibold text-neutral-950">{`#${summary.number} ${summary.title}`}</p>
        </div>
        <a
          className="rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-950"
          href={summary.url}
          rel="noreferrer"
          target="_blank"
        >
          打开 GitHub
        </a>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-neutral-700 md:grid-cols-2">
        <div className="flex items-center gap-2">
          <User aria-hidden="true" className="h-4 w-4 text-neutral-500" />
          <span>{summary.author}</span>
        </div>
        <div className="flex items-center gap-2">
          <GitBranch aria-hidden="true" className="h-4 w-4 text-neutral-500" />
          <span>
            {summary.baseRef} ← {summary.headRef}
          </span>
        </div>
      </div>

      {detail ? (
        <div className="mt-4 grid divide-y divide-neutral-200 border-y border-neutral-200 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Metric label="变更文件" value={`${detail.changedFiles} 个文件`} />
          <Metric label="新增" value={`+${detail.additions}`} />
          <Metric label="删除" value={`-${detail.deletions}`} />
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 sm:px-4 first:sm:pl-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-950">{value}</p>
    </div>
  );
}

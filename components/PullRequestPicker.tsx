"use client";

import { GitPullRequest, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { PullRequestSummary } from "../lib/types";
import { cn } from "../lib/ui";

interface PullRequestPickerProps {
  onSelect: (pullRequest: PullRequestSummary) => void;
  pullRequests: PullRequestSummary[];
  selectedNumber?: number;
}

export function PullRequestPicker({
  onSelect,
  pullRequests,
  selectedNumber,
}: PullRequestPickerProps) {
  const [filter, setFilter] = useState("");
  const normalizedFilter = filter.trim().toLowerCase();
  const filteredPullRequests = useMemo(
    () =>
      pullRequests.filter((pullRequest) => {
        if (!normalizedFilter) {
          return true;
        }

        return (
          pullRequest.title.toLowerCase().includes(normalizedFilter) ||
          String(pullRequest.number).includes(normalizedFilter)
        );
      }),
    [normalizedFilter, pullRequests],
  );

  return (
    <section aria-labelledby="pull-picker-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitPullRequest aria-hidden="true" className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-950" id="pull-picker-heading">
            开放 PR
          </h2>
        </div>
        <label className="relative min-w-[220px] text-sm font-medium text-neutral-700">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          />
          <span className="sr-only">筛选 PR</span>
          <input
            aria-label="筛选 PR"
            className="h-9 w-full rounded-md border border-neutral-300 bg-white pl-9 pr-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="标题或编号"
            type="search"
            value={filter}
          />
        </label>
      </div>

      {filteredPullRequests.length > 0 ? (
        <ul aria-label="开放 PR" className="mt-4 divide-y divide-neutral-100" role="list">
          {filteredPullRequests.map((pullRequest) => {
            const selected = pullRequest.number === selectedNumber;

            return (
              <li className="py-2" key={pullRequest.number}>
                <button
                  aria-label={`选择 #${pullRequest.number} ${pullRequest.title}`}
                  className={cn(
                    "grid w-full gap-1 rounded-md border px-3 py-3 text-left transition",
                    selected
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-neutral-200 bg-white text-neutral-950 hover:border-neutral-400",
                  )}
                  onClick={() => onSelect(pullRequest)}
                  type="button"
                >
                  <span className="text-sm font-semibold">{`#${pullRequest.number} ${pullRequest.title}`}</span>
                  <span className={cn("text-xs", selected ? "text-neutral-200" : "text-neutral-500")}>
                    {pullRequest.author} · {pullRequest.baseRef} ← {pullRequest.headRef}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">没有匹配的开放 PR</p>
      )}
    </section>
  );
}

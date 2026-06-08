"use client";

import { History, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  clearHistoryRecords,
  deleteHistoryRecord,
  listHistoryRecords,
} from "../lib/storage";
import type { HistoryRecord } from "../lib/types";

export function HistoryPanel() {
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      try {
        const savedRecords = await listHistoryRecords();
        if (!cancelled) {
          setMounted(true);
          setRecords(savedRecords);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setMounted(true);
          setError("历史记录加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(record: HistoryRecord) {
    await deleteHistoryRecord(record.id);
    setRecords((current) => current.filter((item) => item.id !== record.id));
  }

  async function handleClear() {
    await clearHistoryRecords();
    setRecords([]);
  }

  return (
    <section
      aria-busy={!mounted || !loaded}
      aria-labelledby="history-heading"
      className="overflow-hidden rounded-md border border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <History aria-hidden="true" className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-950" id="history-heading">
            历史
          </h2>
        </div>
        <button
          className="h-8 rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!loaded || records.length === 0}
          onClick={handleClear}
          type="button"
        >
          清空历史
        </button>
      </div>

      <div className="px-5 py-4">
        {!loaded ? <p className="text-sm text-neutral-500">加载中</p> : null}
        {loaded && error ? <p className="text-sm text-red-700">{error}</p> : null}
        {loaded && !error && records.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无历史记录</p>
        ) : null}
        {loaded && !error && records.length > 0 ? (
          <ul aria-label="历史记录" className="divide-y divide-neutral-100" role="list">
            {records.map((record) => (
              <li className="flex items-start justify-between gap-4 py-3" key={record.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-950">{record.pullRequest.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {record.repository.owner}/{record.repository.repo} #{record.pullRequest.number}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{formatCreatedAt(record.createdAt)}</p>
                </div>
                <button
                  aria-label={`删除 ${record.pullRequest.title}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 text-neutral-500 transition hover:border-red-300 hover:text-red-700"
                  onClick={() => void handleDelete(record)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

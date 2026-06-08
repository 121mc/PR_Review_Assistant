"use client";

import { CheckCircle2, Clipboard, Send } from "lucide-react";
import { useState } from "react";
import { publishReviewCommentWithApi } from "../lib/client-api";
import type { ReviewCommentDraft } from "../lib/types";
import { StatusMessage } from "./StatusMessage";

interface ReviewDraftProps {
  draft: ReviewCommentDraft;
  githubToken: string;
  owner: string;
  persisted: boolean;
  pullNumber: number;
  repo: string;
}

type DraftStatus = {
  message: string;
  tone: "success" | "error";
};

export function ReviewDraft({ draft, githubToken, owner, persisted, pullNumber, repo }: ReviewDraftProps) {
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState(draft.githubCommentUrl ?? "");
  const [status, setStatus] = useState<DraftStatus | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft.body);
      setStatus({ message: "评论已复制", tone: "success" });
    } catch (error) {
      setStatus({ message: readErrorMessage(error, "评论复制失败"), tone: "error" });
    }
  }

  async function handlePublish() {
    if (publishing || publishedUrl) {
      return;
    }

    setStatus(null);

    try {
      const confirmed = window.confirm("确认发布这条评论到 GitHub PR？");
      if (!confirmed) {
        return;
      }

      setPublishing(true);
      const result = await publishReviewCommentWithApi({
        body: draft.body,
        githubToken,
        owner,
        pullNumber,
        repo,
      });
      setPublishedUrl(result.commentUrl);
      setStatus({ message: "评论已发布", tone: "success" });
    } catch (error) {
      setStatus({ message: readErrorMessage(error, "评论发布失败"), tone: "error" });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section aria-labelledby="review-draft-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950" id="review-draft-heading">
            评论草稿
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            {persisted ? "已保存到历史" : "仅保存在当前页面，尚未写入历史"}
          </p>
        </div>
        {publishedUrl ? (
          <a className="text-xs font-medium text-emerald-700 underline-offset-4 hover:underline" href={publishedUrl}>
            查看 GitHub 评论
          </a>
        ) : null}
      </div>

      <textarea
        aria-label="评论草稿内容"
        className="mt-4 min-h-44 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-3 font-mono text-sm leading-6 text-neutral-950 outline-none transition focus:border-neutral-950"
        readOnly
        value={draft.body}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-neutral-300 px-4 text-sm font-medium text-neutral-800 transition hover:border-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void handleCopy()}
          type="button"
        >
          <Clipboard aria-hidden="true" className="h-4 w-4" />
          复制评论
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={publishing || Boolean(publishedUrl)}
          onClick={() => void handlePublish()}
          type="button"
        >
          {publishedUrl ? (
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Send aria-hidden="true" className="h-4 w-4" />
          )}
          {publishing ? "发布中" : publishedUrl ? "已发布" : "发布评论"}
        </button>
        {status ? <StatusMessage tone={status.tone}>{status.message}</StatusMessage> : null}
      </div>
    </section>
  );
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return fallback;
}

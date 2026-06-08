"use client";

import { Link as LinkIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { parseGitHubUrl } from "../lib/url";
import { StatusMessage } from "./StatusMessage";

type LinkStatus =
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

interface LinkInputProps {
  busy?: boolean;
  onChange?: () => void;
  onSubmit?: (url: string) => LinkStatus | Promise<LinkStatus>;
}

export function LinkInput({ busy = false, onChange, onSubmit }: LinkInputProps = {}) {
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<LinkStatus | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    try {
      setStatus(onSubmit ? await onSubmit(link.trim()) : parseLinkLocally(link.trim()));
    } catch {
      setStatus({ tone: "error", message: "链接格式无效" });
    }
  }

  return (
    <section aria-labelledby="link-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="mb-4 flex items-center gap-2">
        <LinkIcon aria-hidden="true" className="h-4 w-4 text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-950" id="link-heading">
          链接
        </h2>
      </div>
      <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
          GitHub 链接
          <input
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
            onChange={(event) => {
              setLink(event.target.value);
              setStatus(null);
              onChange?.();
            }}
            inputMode="url"
            placeholder="https://github.com/owner/repo"
            type="text"
            value={link}
          />
        </label>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 md:self-end"
          disabled={busy}
          type="submit"
        >
          {busy ? "加载中" : "加载"}
        </button>
      </form>
      {status ? (
        <StatusMessage className="mt-3" tone={status.tone}>
          {status.message}
        </StatusMessage>
      ) : null}
    </section>
  );
}

function parseLinkLocally(link: string): LinkStatus {
  const parsed = parseGitHubUrl(link);

  return {
    tone: "success",
    message: parsed.type === "pull" ? "已识别 PR 链接" : "已识别仓库链接",
  };
}

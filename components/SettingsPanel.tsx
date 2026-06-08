"use client";

import { ChevronDown, Save } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import {
  type AppConfig,
  hasCompleteConfig,
  loadAppConfig,
  saveAppConfig,
} from "../lib/storage";
import { cn } from "../lib/ui";
import { StatusMessage } from "./StatusMessage";

const emptyConfig: AppConfig = {
  githubToken: "",
  llmBaseUrl: "",
  llmApiKey: "",
  llmModel: "",
};

export function SettingsPanel() {
  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [expanded, setExpanded] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const saved = loadAppConfig();
      if (saved) {
        setConfig(saved);
      }
      setExpanded((current) => !hasCompleteConfig(saved) || current);
      setMounted(true);
      setLoaded(true);
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  function updateField(field: keyof AppConfig) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setConfig((current) => ({ ...current, [field]: event.target.value }));
      setStatus(null);
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAppConfig(config);
    setExpanded(!hasCompleteConfig(config) || expanded);
    setStatus("配置已保存");
  }

  return (
    <section
      aria-busy={!mounted || !loaded}
      aria-labelledby="settings-heading"
      className="overflow-hidden rounded-md border border-neutral-200 bg-white"
    >
      <button
        aria-controls="settings-panel"
        aria-expanded={expanded}
        aria-label="基础配置"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span>
          <span className="block text-sm font-semibold text-neutral-950" id="settings-heading">
            基础配置
          </span>
          <span className="mt-1 block text-xs text-neutral-500">
            {loaded ? (hasCompleteConfig(config) ? "配置完整" : "待补全") : "加载中"}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 text-neutral-500 transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded ? (
        <form className="grid gap-4 border-t border-neutral-100 px-5 py-5" id="settings-panel" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
              GitHub Token
              <input
                autoComplete="off"
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
                onChange={updateField("githubToken")}
                type="password"
                value={config.githubToken}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
              LLM Base URL
              <input
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
                onChange={updateField("llmBaseUrl")}
                type="url"
                value={config.llmBaseUrl}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
              LLM API Key
              <input
                autoComplete="off"
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
                onChange={updateField("llmApiKey")}
                type="password"
                value={config.llmApiKey}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-neutral-700">
              模型
              <input
                className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
                onChange={updateField("llmModel")}
                type="text"
                value={config.llmModel}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800"
              type="submit"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              保存配置
            </button>
            {status ? <StatusMessage tone="success">{status}</StatusMessage> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

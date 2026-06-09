"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "../lib/ui";

export type AnalysisStage =
  | "fetching-pr"
  | "collecting-context"
  | "calling-llm"
  | "validating-report"
  | "saving-history";

interface AnalysisProgressProps {
  currentStage?: AnalysisStage;
  done?: boolean;
}

const stages: Array<{ id: AnalysisStage; label: string }> = [
  { id: "fetching-pr", label: "获取 PR" },
  { id: "collecting-context", label: "收集上下文" },
  { id: "calling-llm", label: "调用 LLM" },
  { id: "validating-report", label: "验证报告" },
  { id: "saving-history", label: "保存历史" },
];

export function AnalysisProgress({ currentStage, done = false }: AnalysisProgressProps) {
  const currentIndex = stages.findIndex((stage) => stage.id === currentStage);

  return (
    <section aria-labelledby="analysis-progress-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-950" id="analysis-progress-heading">
          分析进度
        </h2>
        <span className={cn("text-xs font-medium", done ? "text-emerald-700" : "text-neutral-500")}>
          {done ? "分析完成" : "分析中"}
        </span>
      </div>

      <ol className="mt-4 grid gap-2" role="list">
        {stages.map((stage, index) => {
          const active = !done && stage.id === currentStage;
          const complete = done || (currentIndex >= 0 && index < currentIndex);

          return (
            <li
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                active && "border-neutral-950 bg-neutral-950 text-white",
                complete && !active && "border-emerald-200 bg-emerald-50 text-emerald-800",
                !active && !complete && "border-neutral-200 bg-neutral-50 text-neutral-600",
              )}
              key={stage.id}
            >
              {active ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : complete ? (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Circle aria-hidden="true" className="h-4 w-4" />
              )}
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

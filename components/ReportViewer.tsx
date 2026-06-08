import ReactMarkdown from "react-markdown";
import { reportToMarkdown } from "../lib/report-markdown";
import type { AnalysisReport } from "../lib/types";

interface ReportViewerProps {
  report: AnalysisReport;
}

export function ReportViewer({ report }: ReportViewerProps) {
  const markdown = reportToMarkdown(report);

  return (
    <section aria-labelledby="report-viewer-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950" id="report-viewer-heading">
            分析报告
          </h2>
          <p className="mt-1 text-xs text-neutral-500">English Markdown report</p>
        </div>
        {report.usedTruncatedContext ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            上下文已被截断，报告基于可用内容生成。
          </p>
        ) : null}
      </div>

      <div className="mt-5 max-w-none text-sm leading-6 text-neutral-800 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-neutral-950 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-neutral-950 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-neutral-950 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown skipHtml>{markdown}</ReactMarkdown>
      </div>
    </section>
  );
}

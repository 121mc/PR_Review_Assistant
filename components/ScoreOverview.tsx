import type { AnalysisReport } from "../lib/types";

interface ScoreOverviewProps {
  report: AnalysisReport;
}

const dimensions: Array<{ key: keyof AnalysisReport["scores"]; label: string }> = [
  { key: "coreFunctionality", label: "Core Functionality" },
  { key: "descriptionAlignment", label: "Description Alignment" },
  { key: "repositoryConventionFit", label: "Repository Convention Fit" },
  { key: "potentialIssues", label: "Potential Issues" },
  { key: "testCoverage", label: "Test Coverage" },
  { key: "maintainability", label: "Maintainability" },
];

export function ScoreOverview({ report }: ScoreOverviewProps) {
  return (
    <section aria-labelledby="score-overview-heading" className="rounded-md border border-neutral-200 bg-white px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-950" id="score-overview-heading">
            评分概览
          </h2>
          <p className="mt-1 text-xs text-neutral-500">Validated analysis scores</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-normal text-neutral-500">Overall Score</p>
          <p className="mt-1 text-3xl font-semibold text-neutral-950">{report.overallScore}/10</p>
        </div>
      </div>

      <div aria-label="Dimension Scores" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dimensions.map((dimension) => {
          const item = report.scores[dimension.key];

          return (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3" key={dimension.key}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-neutral-950">{dimension.label}</h3>
                <span className="shrink-0 text-sm font-semibold text-neutral-950">{item.score}/10</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-600">{item.rationale}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

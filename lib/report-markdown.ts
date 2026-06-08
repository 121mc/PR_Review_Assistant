import { parseAnalysisReport } from "./report-schema";
import type { AnalysisReport, ScoreItem } from "./types";

const SCORE_SECTIONS: Array<[string, keyof AnalysisReport["scores"]]> = [
  ["Core Functionality", "coreFunctionality"],
  ["Description Alignment", "descriptionAlignment"],
  ["Repository Convention Fit", "repositoryConventionFit"],
  ["Potential Issues", "potentialIssues"],
  ["Test Coverage", "testCoverage"],
  ["Maintainability", "maintainability"],
];

export function reportToMarkdown(report: AnalysisReport): string {
  const validatedReport = parseAnalysisReport(report);
  const sections = SCORE_SECTIONS.map(([label, key]) => formatScoreSection(label, validatedReport.scores[key]));

  return [
    "# Pull Request Analysis Report",
    "",
    "## Summary",
    "",
    validatedReport.summary,
    "",
    "## Overall",
    "",
    `**Overall Score:** ${validatedReport.overallScore}/10`,
    `**Verdict:** ${validatedReport.verdict}`,
    `**Used Truncated Context:** ${validatedReport.usedTruncatedContext ? "Yes" : "No"}`,
    "",
    validatedReport.overallRationale,
    "",
    ...sections,
    "## Review Comment",
    "",
    validatedReport.reviewComment,
  ].join("\n");
}

function formatScoreSection(label: string, item: ScoreItem): string {
  return [
    `## ${label}`,
    "",
    `**Score:** ${item.score}/10`,
    "",
    item.rationale,
    "",
    "**Evidence**",
    ...formatList(item.evidence),
    "",
    "**Recommendations**",
    ...formatList(item.recommendations),
    "",
  ].join("\n");
}

function formatList(items: string[]): string[] {
  if (items.length === 0) {
    return ["- None."];
  }

  return items.map((item) => `- ${item}`);
}

import type { AnalysisReport } from "./types";

export function reportToMarkdown(report: AnalysisReport): string {
  const verdictLabels: Record<string, string> = {
    approve: "Approve",
    request_changes: "Request Changes",
    comment: "Comment",
  };

  const dimensions = [
    { key: "coreFunctionality", label: "Core Functionality" },
    { key: "descriptionAlignment", label: "Description Alignment" },
    { key: "repositoryConventionFit", label: "Repository Convention Fit" },
    { key: "potentialIssues", label: "Potential Issues" },
    { key: "testCoverage", label: "Test Coverage" },
    { key: "maintainability", label: "Maintainability" },
  ] as const;

  let markdown = `# Pull Request Analysis Report\n\n`;
  markdown += `## Summary\n${report.summary}\n\n`;
  markdown += `## Verdict: ${verdictLabels[report.verdict] || report.verdict} | Overall Score: ${report.overallScore}/10\n\n`;

  if (report.usedTruncatedContext) {
    markdown += `> **Warning**: This analysis was performed on truncated context because the size exceeded limits.\n\n`;
  }

  markdown += `## Scoring Dimensions\n\n`;

  for (const { key, label } of dimensions) {
    const item = report.scores[key];
    markdown += `### ${label} (${item.score}/10)\n`;
    markdown += `**Rationale**:\n${item.rationale}\n\n`;

    if (item.evidence.length > 0) {
      markdown += `**Evidence**:\n`;
      for (const ev of item.evidence) {
        markdown += `- ${ev}\n`;
      }
      markdown += `\n`;
    }

    if (item.recommendations.length > 0) {
      markdown += `**Recommendations**:\n`;
      for (const rec of item.recommendations) {
        markdown += `- ${rec}\n`;
      }
      markdown += `\n`;
    }
  }

  markdown += `## Review Comment Draft\n\`\`\`markdown\n${report.reviewComment}\n\`\`\`\n`;

  return markdown;
}

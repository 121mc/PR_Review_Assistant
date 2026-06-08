import type { AnalysisReport } from "../../lib/types";

const item = {
  score: 8,
  rationale: "The implementation is coherent and evidence-backed.",
  evidence: ["The diff adds focused behavior."],
  recommendations: ["Add one more regression test."],
};

export const validReport: AnalysisReport = {
  summary: "This PR is mostly acceptable with minor follow-up suggestions.",
  scores: {
    coreFunctionality: item,
    descriptionAlignment: item,
    repositoryConventionFit: item,
    potentialIssues: item,
    testCoverage: item,
    maintainability: item,
  },
  overallScore: 8,
  verdict: "comment",
  reviewComment: "## Review\n\nLooks good with minor suggestions.",
  usedTruncatedContext: false,
};

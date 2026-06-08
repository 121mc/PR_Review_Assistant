import { z } from "zod";
import type { AnalysisReport } from "./types";

const scoreItemSchema = z.object({
  score: z.number().min(0).max(10),
  rationale: z.string(),
  evidence: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export const analysisReportSchema = z.object({
  summary: z.string(),
  scores: z.object({
    coreFunctionality: scoreItemSchema,
    descriptionAlignment: scoreItemSchema,
    repositoryConventionFit: scoreItemSchema,
    potentialIssues: scoreItemSchema,
    testCoverage: scoreItemSchema,
    maintainability: scoreItemSchema,
  }),
  overallScore: z.number().min(0).max(10),
  verdict: z.enum(["approve", "request_changes", "comment"]),
  reviewComment: z.string(),
  usedTruncatedContext: z.boolean(),
});

export function parseAnalysisReport(input: unknown): AnalysisReport {
  return analysisReportSchema.parse(input) as AnalysisReport;
}

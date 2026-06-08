import { z } from "zod";
import type { AnalysisReport } from "./types";

const scoreItemSchema = z
  .object({
    score: z.number().min(0).max(10),
    rationale: z.string().min(1),
    evidence: z.array(z.string()),
    recommendations: z.array(z.string()),
  })
  .strict();

export const analysisReportSchema = z
  .object({
    summary: z.string().min(1),
    scores: z
      .object({
        coreFunctionality: scoreItemSchema,
        descriptionAlignment: scoreItemSchema,
        repositoryConventionFit: scoreItemSchema,
        potentialIssues: scoreItemSchema,
        testCoverage: scoreItemSchema,
        maintainability: scoreItemSchema,
      })
      .strict(),
    overallScore: z.number().min(0).max(10),
    overallRationale: z.string().min(1),
    verdict: z.enum(["approve", "request_changes", "comment"]),
    reviewComment: z.string().min(1),
    usedTruncatedContext: z.boolean(),
  })
  .strict();

export function parseAnalysisReport(input: unknown): AnalysisReport {
  const result = analysisReportSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");

    throw new Error(`Invalid analysis report: ${details}`);
  }

  return result.data;
}

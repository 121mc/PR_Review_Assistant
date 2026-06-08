import { describe, expect, it } from "vitest";
import { reportToMarkdown } from "../lib/report-markdown";
import { parseAnalysisReport } from "../lib/report-schema";
import { validReport } from "./fixtures/report";

describe("parseAnalysisReport", () => {
  it("accepts a complete valid report", () => {
    expect(parseAnalysisReport(validReport).overallScore).toBe(8);
  });

  it("rejects scores outside the 0 to 10 range", () => {
    expect(() =>
      parseAnalysisReport({
        ...validReport,
        overallScore: 11,
      }),
    ).toThrow(/overallScore/i);
  });

  it("rejects unknown verdict values", () => {
    expect(() =>
      parseAnalysisReport({
        ...validReport,
        verdict: "merge_now",
      }),
    ).toThrow(/verdict/i);
  });

  it("requires an overall rationale for the model-generated overall score", () => {
    const reportWithoutRationale: Partial<typeof validReport> = { ...validReport };
    delete reportWithoutRationale.overallRationale;

    expect(() => parseAnalysisReport(reportWithoutRationale)).toThrow(/overallRationale/i);
  });
});

describe("reportToMarkdown", () => {
  it("renders a stable English markdown report", () => {
    expect(reportToMarkdown(validReport)).toContain("# Pull Request Analysis Report");
    expect(reportToMarkdown(validReport)).toContain("**Overall Score:** 8/10");
    expect(reportToMarkdown(validReport)).toContain("**Verdict:** comment");
    expect(reportToMarkdown(validReport)).toContain("## Core Functionality");
    expect(reportToMarkdown(validReport)).toContain("- The diff adds focused behavior.");
    expect(reportToMarkdown(validReport)).toContain("- Add one more regression test.");
    expect(reportToMarkdown(validReport)).toContain("## Review Comment");
  });
});

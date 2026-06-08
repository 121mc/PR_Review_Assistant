import { describe, expect, it } from "vitest";
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
});

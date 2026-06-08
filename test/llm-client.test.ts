import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { analyzeWithLlm } from "../lib/llm";
import type { AnalysisContext } from "../lib/types";
import { validReport } from "./fixtures/report";
import { server } from "./msw/server";

const llm = { baseUrl: "https://llm.test/v1", apiKey: "sk-secret-llm", model: "model-a" };

describe("analyzeWithLlm", () => {
  it("returns a validated report from chat completions JSON", async () => {
    server.use(
      http.post("https://llm.test/v1/chat/completions", () =>
        HttpResponse.json({
          choices: [{ message: { content: JSON.stringify(validReport) } }],
        }),
      ),
    );

    const report = await analyzeWithLlm({
      llm,
      context: minimalAnalysisContext(),
    });

    expect(report).toEqual(validReport);
  });

  it("retries once after invalid JSON", async () => {
    let calls = 0;
    server.use(
      http.post("https://llm.test/v1/chat/completions", () => {
        calls += 1;

        return HttpResponse.json({
          choices: [{ message: { content: calls === 1 ? "not json" : JSON.stringify(validReport) } }],
        });
      }),
    );

    const report = await analyzeWithLlm({
      llm: { ...llm, baseUrl: "https://llm.test/v1/" },
      context: minimalAnalysisContext(),
    });

    expect(report.verdict).toBe("comment");
    expect(calls).toBe(2);
  });

  it("falls back when response_format is rejected by the provider", async () => {
    let calls = 0;
    const responseFormatValues: unknown[] = [];
    server.use(
      http.post("https://llm.test/v1/chat/completions", async ({ request }) => {
        calls += 1;
        const body = (await request.json()) as { response_format?: unknown };
        responseFormatValues.push(body.response_format);

        if (body.response_format) {
          return HttpResponse.json({ error: { message: "Unknown parameter: response_format" } }, { status: 400 });
        }

        return HttpResponse.json({
          choices: [{ message: { content: JSON.stringify(validReport) } }],
        });
      }),
    );

    const report = await analyzeWithLlm({
      llm,
      context: minimalAnalysisContext(),
    });

    expect(report.overallScore).toBe(8);
    expect(calls).toBe(2);
    expect(responseFormatValues).toEqual([{ type: "json_object" }, undefined]);
  });

  it("sends the rubric and JSON contract in the system prompt", async () => {
    let requestBody: ChatRequestBody | undefined;
    server.use(
      http.post("https://llm.test/v1/chat/completions", async ({ request }) => {
        requestBody = (await request.json()) as ChatRequestBody;

        return HttpResponse.json({
          choices: [{ message: { content: JSON.stringify(validReport) } }],
        });
      }),
    );

    await analyzeWithLlm({
      llm,
      context: minimalAnalysisContext(),
    });

    const systemMessage = requestBody?.messages?.[0];
    expect(systemMessage?.role).toBe("system");
    expect(systemMessage?.content).toContain("English");
    expect(systemMessage?.content).toContain("higher-is-better");
    expect(systemMessage?.content).toContain("overallScore");
    expect(systemMessage?.content).toContain("coreFunctionality");
    expect(systemMessage?.content).toContain("descriptionAlignment");
    expect(systemMessage?.content).toContain("repositoryConventionFit");
    expect(systemMessage?.content).toContain("potentialIssues");
    expect(systemMessage?.content).toContain("testCoverage");
    expect(systemMessage?.content).toContain("maintainability");
    expect(systemMessage?.content).toContain("\"reviewComment\"");
    expect(requestBody?.model).toBe("model-a");
    expect(requestBody?.response_format).toEqual({ type: "json_object" });
  });

  it("maps 401 responses to LLM_UNAUTHORIZED", async () => {
    server.use(
      http.post("https://llm.test/v1/chat/completions", () =>
        HttpResponse.json({ error: { message: "Bad API key" } }, { status: 401 }),
      ),
    );

    await expect(analyzeWithLlm({ llm, context: minimalAnalysisContext() })).rejects.toMatchObject({
      code: "LLM_UNAUTHORIZED",
      status: 401,
    });
  });

  it("maps 404 responses to LLM_MODEL_NOT_FOUND", async () => {
    server.use(
      http.post("https://llm.test/v1/chat/completions", () =>
        HttpResponse.json({ error: { message: "Model not found" } }, { status: 404 }),
      ),
    );

    await expect(analyzeWithLlm({ llm, context: minimalAnalysisContext() })).rejects.toMatchObject({
      code: "LLM_MODEL_NOT_FOUND",
      status: 404,
    });
  });

  it("throws LLM_INVALID_JSON after retry without leaking the API key", async () => {
    server.use(
      http.post("https://llm.test/v1/chat/completions", () =>
        HttpResponse.json({
          choices: [{ message: { content: "not json sk-secret-llm" } }],
        }),
      ),
    );

    try {
      await analyzeWithLlm({ llm, context: minimalAnalysisContext() });
      throw new Error("Expected analyzeWithLlm to reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "LLM_INVALID_JSON" });
      expect(JSON.stringify(error)).not.toContain("sk-secret-llm");
    }
  });
});

type ChatRequestBody = {
  model?: string;
  messages?: Array<{ role?: string; content?: string }>;
  response_format?: unknown;
};

function minimalAnalysisContext(): AnalysisContext {
  return {
    repository: { owner: "octo", repo: "repo", url: "https://github.com/octo/repo" },
    pullRequest: {
      summary: {
        owner: "octo",
        repo: "repo",
        number: 42,
        title: "Fix bug",
        author: "alice",
        state: "open",
        baseRef: "main",
        headRef: "fix",
        updatedAt: "2026-06-08T00:00:00Z",
        url: "https://github.com/octo/repo/pull/42",
      },
      body: "Fixes a bug",
      additions: 3,
      deletions: 1,
      changedFiles: 1,
      draft: false,
    },
    changedFiles: [
      {
        filename: "src/feature.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        changes: 4,
        patch: "@@ -1 +1\n-old\n+new",
        isBinary: false,
        truncated: false,
      },
    ],
    contextFiles: [
      {
        path: "package.json",
        kind: "package",
        content: "{\"scripts\":{\"test\":\"vitest\"}}",
        truncated: false,
      },
    ],
    detectedLanguages: ["TypeScript"],
    truncated: false,
    truncationNotes: [],
  };
}

import { collectAnalysisContext } from "../../../lib/context";
import { createApiError, jsonError } from "../../../lib/errors";
import { GitHubClient } from "../../../lib/github";
import { analyzeWithLlm, type LlmConfig } from "../../../lib/llm";

export const dynamic = "force-dynamic";

interface AnalyzeRequest {
  owner: string;
  repo: string;
  pullNumber: number;
  githubToken: string;
  llm: LlmConfig;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const config = readAnalyzeRequest(body);
    const github = new GitHubClient(config.githubToken);
    const context = await collectAnalysisContext(github, config.owner, config.repo, config.pullNumber);
    const report = await analyzeWithLlm({ llm: config.llm, context });

    return Response.json({ report });
  } catch (error) {
    return jsonError(error, "SERVER_ERROR", 500);
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw createApiError("CONFIG_MISSING", "Request body must be valid JSON", undefined, 400);
  }
}

function readAnalyzeRequest(body: unknown): AnalyzeRequest {
  const missing: string[] = [];
  const record = isRecord(body) ? body : {};
  const llmRecord = isRecord(record.llm) ? record.llm : {};

  const owner = readRequiredString(record, "owner", missing);
  const repo = readRequiredString(record, "repo", missing);
  const pullNumber = readRequiredPositiveInteger(record, "pullNumber", missing);
  const githubToken = readRequiredString(record, "githubToken", missing);
  const llm = {
    baseUrl: readRequiredString(llmRecord, "baseUrl", missing, "llm.baseUrl"),
    apiKey: readRequiredString(llmRecord, "apiKey", missing, "llm.apiKey"),
    model: readRequiredString(llmRecord, "model", missing, "llm.model"),
  };

  if (missing.length > 0) {
    throw createApiError(
      "CONFIG_MISSING",
      "Request body must include owner, repo, pullNumber, githubToken, llm.baseUrl, llm.apiKey, and llm.model",
      { missing },
      400,
    );
  }

  return { owner, repo, pullNumber, githubToken, llm };
}

function readRequiredString(
  record: Record<string, unknown>,
  field: string,
  missing: string[],
  label = field,
): string {
  const value = record[field];
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  missing.push(label);
  return "";
}

function readRequiredPositiveInteger(record: Record<string, unknown>, field: string, missing: string[]): number {
  const value = record[field];
  if (Number.isInteger(value) && Number(value) > 0) {
    return value as number;
  }

  missing.push(field);
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

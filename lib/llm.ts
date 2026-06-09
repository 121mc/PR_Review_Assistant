import { createApiError, redactSecrets } from "./errors";
import { parseAnalysisReport } from "./report-schema";
import type { AnalysisContext, AnalysisReport, ApiError } from "./types";

export type LlmConfig = { baseUrl: string; apiKey: string; model: string };

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  response_format?: { type: "json_object" };
};

type CompletionResult = {
  content: string;
  supportsResponseFormat: boolean;
};

const REQUEST_TIMEOUT_MS = 60_000;
const JSON_RESPONSE_FORMAT = { type: "json_object" } as const;

const exampleReport: AnalysisReport = {
  summary: "The pull request is focused and mostly ready, with a few test coverage improvements recommended.",
  scores: {
    coreFunctionality: {
      score: 8,
      rationale: "The implementation addresses the stated behavior and avoids broad unrelated changes.",
      evidence: ["The changed file updates the target feature path."],
      recommendations: ["Exercise one more edge case before merging."],
    },
    descriptionAlignment: {
      score: 8,
      rationale: "The code changes align with the pull request title and body.",
      evidence: ["The PR body says it fixes the bug touched by the diff."],
      recommendations: ["Clarify any user-visible behavior changes in the PR description."],
    },
    repositoryConventionFit: {
      score: 8,
      rationale: "The code follows the repository's TypeScript and testing conventions.",
      evidence: ["The patch uses the existing Vitest setup."],
      recommendations: ["Keep names consistent with nearby modules."],
    },
    potentialIssues: {
      score: 7,
      rationale: "No blocking issue is evident, but one boundary condition needs more confidence.",
      evidence: ["The diff is small and localized."],
      recommendations: ["Add a regression test for the boundary condition."],
    },
    testCoverage: {
      score: 7,
      rationale: "Tests cover the main path but not every failure mode.",
      evidence: ["The PR includes a focused unit test."],
      recommendations: ["Add a negative-path test."],
    },
    maintainability: {
      score: 8,
      rationale: "The implementation is readable and keeps responsibilities separated.",
      evidence: ["The change avoids extra abstractions."],
      recommendations: ["Document any non-obvious compatibility behavior."],
    },
  },
  overallScore: 8,
  overallRationale: "The overall score is aligned with the six sub-scores and reflects a mostly ready change.",
  verdict: "comment",
  reviewComment: "## Review\n\nThis is mostly ready. Please add one focused regression test before merging.",
  usedTruncatedContext: false,
};

const systemPrompt = `You are a senior pull request reviewer.

Return JSON only. Do not wrap it in Markdown or explanatory prose.
All report text must be written in English.
Use exactly these six score dimensions: coreFunctionality, descriptionAlignment, repositoryConventionFit, potentialIssues, testCoverage, maintainability.
Every score is higher-is-better on a 0 to 10 scale, where 10 is excellent and 0 is unusable.
The overallScore must be logically aligned with the six sub-scores and justified by overallRationale.
The verdict must be one of approve, request_changes, or comment.

Return a complete JSON object matching this AnalysisReport example:
${JSON.stringify(exampleReport, null, 2)}`;

export async function analyzeWithLlm(input: {
  llm: LlmConfig;
  context: AnalysisContext;
}): Promise<AnalysisReport> {
  const messages = buildMessages(input.context);
  let supportsResponseFormat = true;
  let lastInvalidOutputError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await requestCompletion(input.llm, messages, supportsResponseFormat);
    supportsResponseFormat = completion.supportsResponseFormat;

    try {
      return parseAnalysisReport(JSON.parse(completion.content));
    } catch (error) {
      lastInvalidOutputError = error;
    }
  }

  throw createApiError(
    "LLM_INVALID_JSON",
    "LLM returned invalid JSON or a response that did not match the analysis report schema.",
    { cause: redactSecrets(lastInvalidOutputError) },
    502,
  );
}

function buildMessages(context: AnalysisContext): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Analyze this pull request context and produce the JSON report.\n\n${JSON.stringify(context, null, 2)}`,
    },
  ];
}

async function requestCompletion(
  llm: LlmConfig,
  messages: ChatMessage[],
  supportsResponseFormat: boolean,
): Promise<CompletionResult> {
  if (!supportsResponseFormat) {
    return {
      content: await postChatCompletion(llm, messages, false),
      supportsResponseFormat: false,
    };
  }

  try {
    return {
      content: await postChatCompletion(llm, messages, true),
      supportsResponseFormat: true,
    };
  } catch (error) {
    if (!isResponseFormatRejection(error)) {
      throw error;
    }

    return {
      content: await postChatCompletion(llm, messages, false),
      supportsResponseFormat: false,
    };
  }
}

async function postChatCompletion(llm: LlmConfig, messages: ChatMessage[], includeResponseFormat: boolean) {
  const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizeBaseUrl(llm.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody(llm.model, messages, includeResponseFormat)),
      signal: timeout.signal,
    });
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw mapHttpError(response.status, payload);
    }

    return extractContent(payload);
  } catch (error) {
    if (isTimeoutError(error)) {
      throw createApiError("LLM_TIMEOUT", "LLM request timed out.", undefined, 504);
    }

    throw error;
  } finally {
    timeout.cleanup();
  }
}

function buildRequestBody(model: string, messages: ChatMessage[], includeResponseFormat: boolean): ChatRequest {
  return {
    model,
    messages,
    ...(includeResponseFormat ? { response_format: JSON_RESPONSE_FORMAT } : {}),
  };
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractContent(payload: unknown) {
  if (!isRecord(payload)) {
    throw invalidResponseError("LLM response body was not a JSON object.", payload);
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw invalidResponseError("LLM response did not include choices[0].", payload);
  }

  const firstChoice = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw invalidResponseError("LLM response did not include choices[0].message.", payload);
  }

  const content = firstChoice.message.content;

  if (typeof content !== "string") {
    throw invalidResponseError("LLM response did not include choices[0].message.content.", payload);
  }

  return content;
}

function invalidResponseError(reason: string, payload: unknown): ApiError {
  return createApiError(
    "LLM_RESPONSE_INVALID",
    "LLM provider returned an invalid chat completion response.",
    { reason, payload: redactSecrets(payload) },
    502,
  );
}

function mapHttpError(status: number, payload: unknown): ApiError {
  if (status === 401) {
    return createApiError("LLM_UNAUTHORIZED", "LLM provider rejected the API key.", providerErrorDetails(payload), 401);
  }

  if (status === 404) {
    return createApiError("LLM_MODEL_NOT_FOUND", "LLM provider could not find the requested model.", providerErrorDetails(payload), 404);
  }

  return createApiError(
    "LLM_REQUEST_FAILED",
    `LLM provider request failed with HTTP ${status}.`,
    providerErrorDetails(payload),
    status,
  );
}

function providerErrorDetails(payload: unknown) {
  const providerMessage = extractProviderMessage(payload);

  if (providerMessage === undefined) {
    return undefined;
  }

  return { providerMessage: redactSecrets(providerMessage) as string };
}

function extractProviderMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }

  if (!isRecord(payload)) {
    return undefined;
  }

  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return undefined;
}

function isResponseFormatRejection(error: unknown) {
  if (!isApiError(error) || error.status !== 400) {
    return false;
  }

  const message = `${error.message} ${JSON.stringify(error.details ?? {})}`;

  return /response[_\s-]?format|json_object|unknown parameter|unsupported|not supported|invalid parameter/i.test(message);
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => undefined };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function isApiError(error: unknown): error is ApiError {
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    (error.details === undefined || isRecord(error.details)) &&
    (error.status === undefined || typeof error.status === "number")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

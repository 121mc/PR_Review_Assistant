// Shared domain types — aligned with design spec data model

export interface RepositoryRef {
  owner: string;
  repo: string;
  url: string;
}

export interface PullRequestSummary {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  state: "open" | "closed";
  baseRef: string;
  headRef: string;
  updatedAt: string;
  url: string;
}

export interface PullRequestDetail {
  summary: PullRequestSummary;
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable?: boolean;
  draft: boolean;
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  rawUrl?: string;
  isBinary: boolean;
  contentSnippet?: string;
  truncated: boolean;
}

export interface RepositoryContextFile {
  path: string;
  kind: "readme" | "contributing" | "package" | "lint" | "test" | "build" | "ci" | "language" | "other";
  content: string;
  truncated: boolean;
}

export interface ScoreItem {
  score: number;
  rationale: string;
  evidence: string[];
  recommendations: string[];
}

export interface AnalysisReport {
  summary: string;
  scores: {
    coreFunctionality: ScoreItem;
    descriptionAlignment: ScoreItem;
    repositoryConventionFit: ScoreItem;
    potentialIssues: ScoreItem;
    testCoverage: ScoreItem;
    maintainability: ScoreItem;
  };
  overallScore: number;
  verdict: "approve" | "request_changes" | "comment";
  reviewComment: string;
  usedTruncatedContext: boolean;
}

export interface ReviewCommentDraft {
  body: string;
  sourceReportId: string;
  publishedAt?: string;
  githubCommentUrl?: string;
}

export interface AnalysisContext {
  repository: RepositoryRef;
  pullRequest: PullRequestDetail;
  changedFiles: ChangedFile[];
  contextFiles: RepositoryContextFile[];
  detectedLanguages: string[];
  truncated: boolean;
  truncationNotes: string[];
}

export interface HistoryRecord {
  id: string;
  createdAt: string;
  repository: RepositoryRef;
  pullRequest: PullRequestSummary;
  report: AnalysisReport;
  reviewDraft: ReviewCommentDraft;
  contextSummary: {
    changedFileCount: number;
    contextFileCount: number;
    truncated: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status: number;
}

export interface AppConfig {
  githubToken: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
}

// GitHub REST client — stub for Task 3 & 6.
// Full implementation is in Task 4.
import type { PullRequestSummary, PullRequestDetail, ChangedFile } from "./types";

export class GitHubClient {
  constructor(private readonly token: string) {}

  async listOpenPulls(_owner: string, _repo: string): Promise<PullRequestSummary[]> {
    throw new Error("Not implemented (Task 4)");
  }

  async getPullDetail(
    _owner: string,
    _repo: string,
    _pullNumber: number,
  ): Promise<PullRequestDetail> {
    throw new Error("Not implemented (Task 4)");
  }

  async listChangedFiles(
    _owner: string,
    _repo: string,
    _pullNumber: number,
  ): Promise<ChangedFile[]> {
    throw new Error("Not implemented (Task 4)");
  }

  async getFileContent(
    _owner: string,
    _repo: string,
    _path: string,
    _ref: string,
  ): Promise<string | null> {
    throw new Error("Not implemented (Task 4)");
  }

  async createPullComment(
    _owner: string,
    _repo: string,
    _pullNumber: number,
    _body: string,
  ): Promise<{ commentUrl: string }> {
    throw new Error("Not implemented (Task 4)");
  }
}

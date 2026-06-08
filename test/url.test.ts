import { describe, expect, it } from "vitest";
import { parseGitHubUrl } from "../lib/url";

describe("parseGitHubUrl", () => {
  it("parses repository urls", () => {
    expect(parseGitHubUrl("https://github.com/octo/repo")).toEqual({
      type: "repo",
      owner: "octo",
      repo: "repo",
    });
  });

  it("parses repository urls with trailing slashes", () => {
    expect(parseGitHubUrl("https://github.com/octo/repo/")).toEqual({
      type: "repo",
      owner: "octo",
      repo: "repo",
    });
  });

  it("parses pull request urls", () => {
    expect(parseGitHubUrl("https://github.com/octo/repo/pull/42")).toEqual({
      type: "pull",
      owner: "octo",
      repo: "repo",
      pullNumber: 42,
    });
  });

  it("rejects issue urls", () => {
    expect(() => parseGitHubUrl("https://github.com/octo/repo/issues/42")).toThrow(/unsupported/i);
  });

  it("rejects commit urls", () => {
    expect(() => parseGitHubUrl("https://github.com/octo/repo/commit/abc123")).toThrow(/unsupported/i);
  });

  it("rejects non numeric pull request numbers", () => {
    expect(() => parseGitHubUrl("https://github.com/octo/repo/pull/not-a-number")).toThrow(/unsupported/i);
  });

  it("rejects non github urls", () => {
    expect(() => parseGitHubUrl("https://example.com/octo/repo")).toThrow(/github/i);
  });

  it("rejects missing owner or repo", () => {
    expect(() => parseGitHubUrl("https://github.com/octo")).toThrow(/unsupported/i);
    expect(() => parseGitHubUrl("https://github.com/")).toThrow(/unsupported/i);
  });
});

export type ParsedGitHubUrl =
  | { type: "repo"; owner: string; repo: string }
  | { type: "pull"; owner: string; repo: string; pullNumber: number };

/**
 * Parse a GitHub repository or pull-request URL.
 *
 * Supported:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/
 *   https://github.com/owner/repo/pull/123
 *
 * Rejected: non-github hosts, issue URLs, commit URLs, missing owner/repo,
 * non-numeric PR numbers.
 */
export function parseGitHubUrl(rawUrl: string): ParsedGitHubUrl {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL must use github.com");
  }

  if (url.hostname !== "github.com") {
    throw new Error("URL must use github.com");
  }

  const parts = url.pathname.split("/").filter(Boolean);

  // https://github.com/owner/repo[/]
  if (parts.length === 2) {
    return { type: "repo", owner: parts[0], repo: parts[1] };
  }

  // https://github.com/owner/repo/pull/123
  if (parts.length === 4 && parts[2] === "pull" && /^\d+$/.test(parts[3])) {
    return {
      type: "pull",
      owner: parts[0],
      repo: parts[1],
      pullNumber: Number(parts[3]),
    };
  }

  throw new Error("Unsupported GitHub URL");
}

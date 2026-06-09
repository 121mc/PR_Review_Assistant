export type ParsedGitHubUrl =
  | { type: "repo"; owner: string; repo: string }
  | { type: "pull"; owner: string; repo: string; pullNumber: number };

export function parseGitHubUrl(rawUrl: string): ParsedGitHubUrl {
  const url = new URL(rawUrl);
  if (url.hostname !== "github.com") {
    throw new Error("URL must use github.com");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  const parts = pathname.split("/").slice(1);
  if (parts.some((part) => part === "")) {
    throw new Error("Unsupported GitHub URL");
  }

  if (parts.length === 2) {
    return { type: "repo", owner: parts[0], repo: parts[1] };
  }

  if (parts.length === 4 && parts[2] === "pull" && /^\d+$/.test(parts[3])) {
    const pullNumber = Number(parts[3]);
    if (Number.isSafeInteger(pullNumber) && pullNumber >= 1) {
      return { type: "pull", owner: parts[0], repo: parts[1], pullNumber };
    }
  }

  throw new Error("Unsupported GitHub URL");
}

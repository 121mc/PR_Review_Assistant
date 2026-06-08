import type { HttpHandler } from "msw";

const GITHUB_API_BASE_URL = "https://api.github.com";

export function githubApiUrl(path: string) {
  return `${GITHUB_API_BASE_URL}${path}`;
}

export const handlers: HttpHandler[] = [];

import { describe, expect, it } from "vitest";
import { POST } from "../app/api/github/parse-url/route";

describe("POST /api/github/parse-url", () => {
  it("returns parsed pull urls", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://github.com/octo/repo/pull/42" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: "pull",
      owner: "octo",
      repo: "repo",
      pullNumber: 42,
    });
  });

  it("returns INVALID_GITHUB_URL when url is missing", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_GITHUB_URL",
      message: "Request body must include a GitHub URL string",
    });
  });

  it("returns INVALID_GITHUB_URL for malformed json without echoing the body", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: '{"url":"https://github.com/octo/repo","githubToken":"ghp_secret"',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      code: "INVALID_GITHUB_URL",
      message: "Request body must be valid JSON",
    });
    expect(JSON.stringify(body)).not.toContain("ghp_secret");
  });

  it("returns UNSUPPORTED_GITHUB_URL for unsupported github paths", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://github.com/octo/repo/issues/42" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "UNSUPPORTED_GITHUB_URL",
      message: "Unsupported GitHub URL",
    });
  });
});

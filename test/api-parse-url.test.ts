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

  it("returns parsed repo urls", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://github.com/octo/repo" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: "repo",
      owner: "octo",
      repo: "repo",
    });
  });

  it("returns 400 for missing url field", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json() as { code: string };
    expect(body.code).toBe("INVALID_GITHUB_URL");
  });

  it("returns 400 for non-github url", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/octo/repo" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json() as { code: string };
    expect(body.code).toBe("INVALID_GITHUB_URL");
  });

  it("returns 400 for unsupported url path", async () => {
    const request = new Request("http://localhost/api/github/parse-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://github.com/octo/repo/issues/1" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json() as { code: string };
    expect(body.code).toBe("UNSUPPORTED_GITHUB_URL");
  });
});

import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok true", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

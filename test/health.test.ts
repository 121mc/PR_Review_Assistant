import { describe, expect, it } from "vitest";
import { dynamic, GET } from "../app/api/health/route";

describe("GET /api/health", () => {
  it("returns ok true", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("is always dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

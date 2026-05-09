import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

describe("operator health", () => {
  it("GET /health returns ok", async () => {
    const req = new Request("http://example.com/health");
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; service: string }>();
    expect(body.ok).toBe(true);
    expect(body.service).toMatch(/conexple/);
  });
});

import { describe, it, expect } from "vitest";
import { hmacSha256Hex, verifyHmac } from "../lib/hmac";

describe("hmac", () => {
  it("hmacSha256Hex is deterministic", async () => {
    const a = await hmacSha256Hex("secret", "hello");
    const b = await hmacSha256Hex("secret", "hello");
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it("verifyHmac accepts a matching signature", async () => {
    const secret = "test-secret";
    const body = '{"x":1}';
    const sig = await hmacSha256Hex(secret, body);
    expect(await verifyHmac(secret, body, sig)).toBe(true);
  });

  it("verifyHmac rejects a tampered signature", async () => {
    const secret = "test-secret";
    const body = '{"x":1}';
    const sig = await hmacSha256Hex(secret, body);
    const tampered = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(await verifyHmac(secret, body, tampered)).toBe(false);
  });

  it("verifyHmac rejects an empty signature", async () => {
    expect(await verifyHmac("test-secret", "body", "")).toBe(false);
  });
});

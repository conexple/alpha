// HMAC-SHA256 verify using WebCrypto (available in Workers).

export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const keyData = new TextEncoder().encode(secret);
  const msgData = new TextEncoder().encode(body);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgData);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Shared helper for admin/mutating endpoints. Returns { ok, raw } where raw
// is the request body (consumed once — re-use for downstream JSON.parse).
// In demo mode (env.OPERATOR_DEMO_MODE === "true"), auth is skipped so
// hackathon judges can press dashboard buttons. Production deploys leave
// the env var unset/false to enforce HMAC.
export async function requireAdminAuth(
  c: { req: { header: (n: string) => string | undefined; text: () => Promise<string> }; env: { OPERATOR_DEMO_MODE?: string; PURCHASE_WEBHOOK_HMAC: string } },
): Promise<{ ok: true; raw: string; demoMode: boolean } | { ok: false }> {
  const raw = await c.req.text();
  if (c.env.OPERATOR_DEMO_MODE === "true") {
    return { ok: true, raw, demoMode: true };
  }
  const sig = c.req.header("x-conexple-internal");
  if (!sig || !c.env.PURCHASE_WEBHOOK_HMAC) return { ok: false };
  const valid = await verifyHmac(c.env.PURCHASE_WEBHOOK_HMAC, raw, sig);
  return valid ? { ok: true, raw, demoMode: false } : { ok: false };
}

export async function verifyHmac(secret: string, body: string, headerSig: string): Promise<boolean> {
  if (!headerSig) return false;
  const expected = await hmacSha256Hex(secret, body);
  if (expected.length !== headerSig.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ headerSig.charCodeAt(i);
  }
  return diff === 0;
}

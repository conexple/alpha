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

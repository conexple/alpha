// D1-based idempotency replacing Durable Objects for V1.
//
// Usage:
//   const result = await withIdempotency(env, key, "placement", async () => {
//     // perform operation, return JSON-serializable result
//   });
//
// First caller computes the result and stores it. Subsequent callers with the
// same `key` get the cached result. Stale keys are not auto-pruned in V1.

import type { Env } from "../env";

export async function withIdempotency<T>(
  env: Env,
  key: string,
  scope: "placement" | "settlement" | "purchase",
  fn: () => Promise<T>,
): Promise<T> {
  // Try to lock the key. If it already exists, return its result if any.
  const existing = await env.DB.prepare(
    "SELECT result FROM idempotency WHERE key = ? AND scope = ?",
  )
    .bind(key, scope)
    .first<{ result: string | null }>();

  if (existing) {
    if (existing.result) return JSON.parse(existing.result) as T;
    // Existing row but no result — another invocation is in flight or failed.
    throw new Error(`idempotency key ${key} (scope=${scope}) is in flight; retry later`);
  }

  // Insert lock row
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      "INSERT INTO idempotency (key, scope, created_at, payload, result) VALUES (?, ?, ?, NULL, NULL)",
    )
      .bind(key, scope, now)
      .run();
  } catch {
    // Race lost — re-read.
    const existing2 = await env.DB.prepare(
      "SELECT result FROM idempotency WHERE key = ? AND scope = ?",
    )
      .bind(key, scope)
      .first<{ result: string | null }>();
    if (existing2?.result) return JSON.parse(existing2.result) as T;
    throw new Error(`idempotency race for ${key}`);
  }

  // Compute and persist result
  const result = await fn();
  await env.DB.prepare("UPDATE idempotency SET result = ? WHERE key = ? AND scope = ?")
    .bind(JSON.stringify(result), key, scope)
    .run();
  return result;
}

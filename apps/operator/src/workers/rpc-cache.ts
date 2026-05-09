// Read-through cache for Solana RPC `getAccountInfo` calls.
//
// Why: the frontend hits this Worker URL instead of Helius directly. We
// cache hot reads (ProtocolConfig, NetworkState, individual Position) for
// ~5s in KV to absorb judging-time refresh storms without burning the
// Helius free-tier quota.
//
// Endpoints:
//   POST /rpc                  — JSON-RPC pass-through; we only cache
//                                certain method/param combos, others go
//                                straight through.

import { Hono } from "hono";
import type { Env } from "../env";
import { rpcUrl } from "../chain/connection";

export const rpcCacheRoute = new Hono<{ Bindings: Env }>();

const CACHEABLE_METHODS = new Set(["getAccountInfo", "getMultipleAccounts", "getProgramAccounts"]);
const CACHE_TTL_SECONDS = 5;

rpcCacheRoute.post("/", async (c) => {
  const body = await c.req.text();
  const parsed = JSON.parse(body) as { method?: string; params?: unknown };
  const url = rpcUrl(c.env);
  const cacheable = parsed.method && CACHEABLE_METHODS.has(parsed.method);
  if (cacheable) {
    const key = `rpc:${parsed.method}:${JSON.stringify(parsed.params ?? null)}`;
    const cached = await c.env.RPC_CACHE.get(key);
    if (cached) {
      return new Response(cached, { headers: { "content-type": "application/json", "x-conexple-cache": "HIT" } });
    }
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await upstream.text();
    if (upstream.ok) {
      await c.env.RPC_CACHE.put(key, text, { expirationTtl: CACHE_TTL_SECONDS });
    }
    return new Response(text, { status: upstream.status, headers: { "content-type": "application/json", "x-conexple-cache": "MISS" } });
  }
  // Pass-through
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json", "x-conexple-cache": "BYPASS" },
  });
});

// Placement worker — depth-first placement decision under a referrer.
//
// Algorithm (docs/02 §2):
//   1. Start at the referrer's Position node
//   2. Walk depth-first (left-most child first), looking for the first slot
//      where: (a) no children yet, OR (b) hasn't reached MAX_PLACEMENT_DEPTH
//   3. Return that node as the parent
//
// V1: this works directly off the D1 mirror. The on-chain place_member call
// is signed by the oracle and submitted by the caller (or by the same
// worker on demand).

import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import type { Env } from "../env";
import { withIdempotency } from "../lib/idempotency";

export const placementRoute = new Hono<{ Bindings: Env }>();

placementRoute.post("/decide", async (c) => {
  const body = await c.req.json<{ referrer: string; new_wallet: string }>();
  if (!body.referrer || !body.new_wallet) {
    return c.json({ error: "referrer + new_wallet required" }, 400);
  }
  // Idempotency: same (referrer, new_wallet) returns same result
  const key = `${c.env.NETWORK_ID}:${body.referrer}:${body.new_wallet}`;
  const result = await withIdempotency(c.env, key, "placement", async () =>
    decidePlacement(c.env, body.referrer, body.new_wallet),
  );
  return c.json(result);
});

interface PositionRow {
  network_id: string;
  wallet: string;
  parent: string | null;
  depth: number;
  status: string;
}

async function decidePlacement(
  env: Env,
  referrer: string,
  newWallet: string,
): Promise<{ parent: string; depth: number; reason: string }> {
  // Walk depth-first from referrer.
  // V1 simplification: cap traversal at 32 nodes per request to avoid
  // pathological cases on a poorly populated mirror.
  const MAX_NODES = 32;
  const MAX_DEPTH = 5;

  const networkId = env.NETWORK_ID;
  const validate = (s: string) => {
    try {
      return new PublicKey(s).toBase58();
    } catch {
      throw new Error(`invalid pubkey: ${s}`);
    }
  };
  const referrerKey = validate(referrer);
  validate(newWallet);

  // Self-placement is forbidden — referrer can't be the same wallet
  if (referrerKey === newWallet) {
    throw new Error("referrer cannot be the new wallet");
  }

  const start = await loadPosition(env, networkId, referrerKey);
  if (!start) {
    throw new Error(`referrer position not in mirror (run sync)`);
  }
  let candidate: PositionRow = start;
  let visited = 0;
  while (visited < MAX_NODES) {
    visited++;
    if (candidate.depth >= MAX_DEPTH) {
      throw new Error("referrer subtree is at max depth — cannot place deeper");
    }
    const result = await env.DB.prepare(
      "SELECT * FROM positions WHERE network_id = ? AND parent = ? AND status = 'active' ORDER BY joined_at ASC",
    )
      .bind(networkId, candidate.wallet)
      .all<PositionRow>();
    const children = result.results ?? [];
    if (children.length === 0) {
      return {
        parent: candidate.wallet,
        depth: candidate.depth + 1,
        reason: "first-vacancy under referrer",
      };
    }
    // Depth-first: descend into the first child
    candidate = children[0]!;
  }
  throw new Error("placement traversal exceeded MAX_NODES");
}

async function loadPosition(env: Env, networkId: string, wallet: string): Promise<PositionRow | null> {
  return env.DB.prepare(
    "SELECT * FROM positions WHERE network_id = ? AND wallet = ?",
  )
    .bind(networkId, wallet)
    .first<PositionRow>();
}

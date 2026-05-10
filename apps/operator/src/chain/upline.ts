// Walk a buyer's upline by reading on-chain Position accounts directly.
//
// Why on-chain instead of D1 mirror: the D1 `positions` table is currently
// unpopulated (no on-chain → D1 sync job has run yet). Reading on-chain is
// authoritative anyway and the cost is bounded — at most 5 RPC calls per
// purchase per settlement cycle.

import { Connection, PublicKey } from "@solana/web3.js";
import type { Env } from "../env";
import { positionPda } from "./pdas";

export interface UplineHop {
  level: number;       // 1..5 — distance from buyer
  wallet: PublicKey;
  positionPda: PublicKey;
  status: "active" | "expired";
}

/**
 * Layout of `Position` matches programs/conexple-network/src/state.rs.
 * Anchor account discriminator (8 bytes) → fields:
 *   bump (1) network_id (8) wallet (32)
 *   parent: Option<Pubkey>   (1 + 32)
 *   depth (1) status (1)
 *   cumulative_earned (8) earnings_cap (8) last_purchase_round (8)
 *   extension_locked (1) joined_at (8) expired_at: Option<i64> (1 + 8)
 *
 * For upline traversal we only need wallet + parent, but we read status too
 * so we can early-exit if a level is expired (commissions for that level
 * fall through to the social pool per docs/02 §11).
 */
function decodePositionShallow(data: Buffer): {
  wallet: PublicKey;
  parent: PublicKey | null;
  status: "active" | "expired";
} {
  let cur = 8; // skip discriminator
  cur += 1;    // bump
  cur += 8;    // network_id
  const wallet = new PublicKey(data.subarray(cur, cur + 32));
  cur += 32;
  // Anchor `Option<Pubkey>` is variable-length: 1 byte tag, then 32 bytes
  // ONLY if tag === 1. (Misreading this as fixed-length 33 bytes shifts every
  // subsequent field for unplaced root positions and silently corrupts
  // status/depth.)
  const parentTag = data.readUInt8(cur);
  cur += 1;
  let parent: PublicKey | null = null;
  if (parentTag === 1) {
    parent = new PublicKey(data.subarray(cur, cur + 32));
    cur += 32;
  }
  cur += 1;    // depth
  const statusByte = data.readUInt8(cur);
  const status: "active" | "expired" = statusByte === 0 ? "active" : "expired";
  return { wallet, parent, status };
}

/**
 * Trace up to `maxLevels` ancestors of `buyer`, top-up. The first hop is
 * `buyer`'s parent (level 1). Stops early when:
 *   - parent is None (root)
 *   - the next position PDA is not on-chain
 *   - we've collected `maxLevels` hops
 *
 * Returns the hops in order: [level1, level2, ..., levelN].
 */
export async function traceUpline(
  conn: Connection,
  env: Env,
  buyer: PublicKey,
  maxLevels = 5,
): Promise<UplineHop[]> {
  const hops: UplineHop[] = [];
  const [buyerPda] = positionPda(env, buyer);
  const buyerInfo = await conn.getAccountInfo(buyerPda);
  if (!buyerInfo) {
    return hops; // buyer has no position — no upline to credit
  }
  let { parent: nextParent } = decodePositionShallow(buyerInfo.data);

  for (let level = 1; level <= maxLevels; level++) {
    if (!nextParent) break;
    const [pda] = positionPda(env, nextParent);
    const info = await conn.getAccountInfo(pda);
    if (!info) break;
    const decoded = decodePositionShallow(info.data);
    hops.push({
      level,
      wallet: nextParent,
      positionPda: pda,
      status: decoded.status,
    });
    nextParent = decoded.parent;
  }
  return hops;
}

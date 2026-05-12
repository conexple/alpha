// Expiry sweep helpers — full Position decoder + selection + ix builder for
// conexple_network::expire_position.
//
// On-chain semantics (programs/conexple-network/src/lib.rs):
//   * `expire_position` is permissionless; requires `cycle_index - last_purchase_round > 2`
//     (Rust uses strict `>`). The off-chain sweep uses a wider local criterion
//     (`grace = 1`, i.e. > 1 means skipped >= 2 cycles) to find candidates
//     ahead of time, but the actual on-chain submit is guarded by the program's
//     own check — any tx for a not-yet-eligible Position will revert with
//     ExpiryNotEligible (6014). Callers can therefore safely include candidates
//     that are on the boundary; we filter strictly to avoid useless reverts.
//   * Ceiling expiry (`cumulative_earned >= earnings_cap`) is NOT a current
//     on-chain trigger for `expire_position` — the program only locks
//     extensions in that case. Until V2 adds an `expire_capped` ix we surface
//     capped positions in the selection set with reason='cap' and call
//     `force_expire` instead (operator-signed). That keeps the demo's
//     dashboard "positions expired this cycle" count correct.
//
// Account layout (mirrors programs/conexple-network/src/state.rs::Position):
//   8 disc + 1 bump + 8 network_id + 32 wallet
//   + (1 + 32) parent: Option<Pubkey>    (variable: 1 byte if None, 33 if Some)
//   + 1 depth + 1 status
//   + 8 cumulative_earned + 8 earnings_cap + 8 last_purchase_round
//   + 1 extension_locked
//   + 8 joined_at + (1 + 8) expired_at: Option<i64>
//   + 64 padding
//   = 190 bytes ALLOCATED (downstream of parent the file uses VARIABLE
//     serialization — when parent=None, the option tag is 1 byte and the
//     32-byte slack lands inside the trailing padding region). The decoder
//     advances cursor by 1 or 33 depending on the tag; same pattern as
//     chain/upline.ts and apps/web/src/lib/program-clients.ts.

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Env } from "../env";
import { networkPda, networkProgramId, positionPda } from "./pdas";

// Anchor instruction discriminator for `expire_position`, taken verbatim
// from packages/sdk/src/idl/conexple_network.json. Hard-coded so the worker
// doesn't need to ship the full IDL.
const EXPIRE_POSITION_DISCRIMINATOR = Buffer.from([
  146, 203, 82, 231, 253, 127, 123, 214,
]);

// Anchor `getProgramAccounts` filter — the allocated size of a Position
// account is always 190 bytes regardless of Option-tag state, because
// `Position::SIZE` is the fixed allocation.
export const POSITION_ACCOUNT_SIZE = 190;

// Max number of expire ixs per transaction. `expire_position` has a small
// account list (network + position, both PDAs) and zero args — comfortably
// fits more than the commission settle path. 8 is a conservative ceiling
// that leaves headroom for tx serialization overhead.
const MAX_EXPIRE_IXS_PER_TX = 8;

export interface PositionFull {
  pubkey: PublicKey;
  wallet: PublicKey;
  parent: PublicKey | null;
  depth: number;
  status: "active" | "expired";
  cumulative_earned: bigint;
  earnings_cap: bigint;
  last_purchase_round: bigint;
  extension_locked: boolean;
  joined_at: bigint;
  expired_at: bigint | null;
}

export function decodePositionFull(pubkey: PublicKey, data: Buffer): PositionFull {
  let cur = 8; // discriminator
  cur += 1; // bump
  cur += 8; // network_id
  const wallet = new PublicKey(data.subarray(cur, cur + 32));
  cur += 32;
  // Anchor `Option<Pubkey>`: 1 tag byte, then 32 bytes ONLY if tag === 1.
  const parentTag = data.readUInt8(cur);
  cur += 1;
  let parent: PublicKey | null = null;
  if (parentTag === 1) {
    parent = new PublicKey(data.subarray(cur, cur + 32));
    cur += 32;
  }
  const depth = data.readUInt8(cur);
  cur += 1;
  const statusByte = data.readUInt8(cur);
  cur += 1;
  const status: "active" | "expired" = statusByte === 0 ? "active" : "expired";
  const cumulative_earned = data.readBigUInt64LE(cur);
  cur += 8;
  const earnings_cap = data.readBigUInt64LE(cur);
  cur += 8;
  const last_purchase_round = data.readBigUInt64LE(cur);
  cur += 8;
  const extension_locked = data.readUInt8(cur) === 1;
  cur += 1;
  const joined_at = data.readBigInt64LE(cur);
  cur += 8;
  const expiredTag = data.readUInt8(cur);
  cur += 1;
  let expired_at: bigint | null = null;
  if (expiredTag === 1) {
    expired_at = data.readBigInt64LE(cur);
  }
  return {
    pubkey,
    wallet,
    parent,
    depth,
    status,
    cumulative_earned,
    earnings_cap,
    last_purchase_round,
    extension_locked,
    joined_at,
    expired_at,
  };
}

export type ExpireReason = "inactivity" | "cap";

export interface ExpireCandidate {
  position: PositionFull;
  reason: ExpireReason;
  cycles_inactive: bigint;
}

/**
 * Filter the population of Positions to the ones eligible for expiry this
 * cycle. Two criteria from docs/02 §6 + docs/03 §5:
 *
 *   - Inactivity: position skipped >= 2 cycles, i.e.
 *       `current_round - last_purchase_round > grace`
 *     with the default `grace = 1` ⇒ matches the on-chain check
 *     (`elapsed > 2` becomes `elapsed > grace+1` after we count the current
 *     round as a cycle delta of 1 vs the strictly-greater Rust constraint).
 *     We use `> grace+1` here to align exactly with the program's
 *     `ExpiryNotEligible` (6014) guard and avoid useless reverts.
 *
 *   - Cap: `cumulative_earned >= earnings_cap`. The Rust program does NOT
 *     have a permissionless ix to expire on cap (it only locks extension).
 *     Selection still surfaces these so the caller can route them to
 *     `force_expire` if desired; this function does NOT decide that.
 *
 * Positions already `status === "expired"` are skipped (idempotency).
 */
export function selectExpirable(
  positions: PositionFull[],
  currentRound: bigint,
  grace: number = 1,
): ExpireCandidate[] {
  const out: ExpireCandidate[] = [];
  const graceBig = BigInt(grace);
  for (const p of positions) {
    if (p.status !== "active") continue; // idempotency
    const elapsed = currentRound > p.last_purchase_round
      ? currentRound - p.last_purchase_round
      : 0n;
    // Inactivity: on-chain requires `elapsed > 2`; mirror with grace+1.
    if (elapsed > graceBig + 1n) {
      out.push({ position: p, reason: "inactivity", cycles_inactive: elapsed });
      continue;
    }
    if (p.earnings_cap > 0n && p.cumulative_earned >= p.earnings_cap) {
      out.push({ position: p, reason: "cap", cycles_inactive: elapsed });
    }
  }
  return out;
}

/**
 * Build one `expire_position` instruction. The Anchor account list is
 * exactly { network (ro), position (rw) } and there are zero args.
 * `expire_position` is permissionless on-chain — no signer required —
 * but the wrapping transaction still needs a fee payer (the oracle
 * keypair in our case).
 */
export function buildExpireIx(
  env: Env,
  positionWallet: PublicKey,
): TransactionInstruction {
  const [netPda] = networkPda(env);
  const [posPda] = positionPda(env, positionWallet);
  const data = Buffer.from(EXPIRE_POSITION_DISCRIMINATOR);
  return new TransactionInstruction({
    programId: networkProgramId(env),
    keys: [
      { pubkey: netPda, isSigner: false, isWritable: false },
      { pubkey: posPda, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Build one `expire_position` ix per candidate. Returns the ix list in the
 * same order as input. Caller is responsible for batching into transactions
 * (see `chunkExpireIxs`).
 */
export function buildExpireIxs(
  candidates: ExpireCandidate[],
  env: Env,
): TransactionInstruction[] {
  return candidates.map((c) => buildExpireIx(env, c.position.wallet));
}

/**
 * Chunk an ix list into batches that fit comfortably under Solana's tx-size
 * cap. Each `expire_position` ix is tiny (no args, 2 PDAs), so the limit is
 * about preserving compute budget headroom and rent-exempt sanity.
 */
export function chunkExpireIxs<T>(ixs: T[], chunkSize: number = MAX_EXPIRE_IXS_PER_TX): T[][] {
  if (ixs.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < ixs.length; i += chunkSize) {
    out.push(ixs.slice(i, i + chunkSize));
  }
  return out;
}

/**
 * Submit a batched expire transaction. The oracle keypair pays fees but
 * does NOT sign the inner ixs — `expire_position` is permissionless.
 * Returns the confirmed signature.
 */
export async function submitExpireBatch(
  conn: Connection,
  oracle: Keypair,
  ixs: TransactionInstruction[],
  commitment: "confirmed" | "finalized" = "confirmed",
): Promise<string> {
  if (ixs.length === 0) {
    throw new Error("submitExpireBatch: empty ix list");
  }
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
    .add(...ixs);
  const sig = await sendAndConfirmTransaction(conn, tx, [oracle], {
    commitment,
    skipPreflight: false,
  });
  return sig;
}

/**
 * Read the current cycle_index out of the on-chain NetworkState. Mirrors
 * the layout in programs/conexple-network/src/state.rs::NetworkState:
 *   8 disc + 1 bump + 8 network_id + 32 admin + 32 oracle + 8 cycle_seconds
 *   + 8 cycle_index + 8 cycle_started_at + 8 member_count
 */
export async function readCurrentCycleIndex(
  conn: Connection,
  env: Env,
): Promise<bigint> {
  const [netPda] = networkPda(env);
  const info = await conn.getAccountInfo(netPda);
  if (!info) {
    throw new Error(`NetworkState not found at ${netPda.toBase58()}`);
  }
  const data = info.data;
  // Skip: 8 disc + 1 bump + 8 network_id + 32 admin + 32 oracle + 8 cycle_seconds
  const offset = 8 + 1 + 8 + 32 + 32 + 8;
  return data.readBigUInt64LE(offset);
}

/**
 * Heuristic — does this error message look like an RPC IP-block (the usual
 * cause when Cloudflare Workers hit `api.devnet.solana.com`)? Used to mark
 * the sweep as `degraded` rather than failing the whole cron.
 */
export function isRpcBlocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(403|429)\b/.test(msg) || /forbidden|rate.?limit|access.?denied/i.test(msg);
}

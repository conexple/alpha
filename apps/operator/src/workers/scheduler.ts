// Scheduler worker — cycle cut-off settlement run.
//
// Triggered by:
//   * Cron at "0 23 * * *" (daily 23:00 UTC) → runScheduledSettlement
//   * POST /settle/run            — manual ops trigger; runs the on-chain
//                                   settle pipeline directly from the
//                                   Worker (requires a Helius/private RPC
//                                   that does not block CF Workers' IPs)
//   * GET  /settle/pending        — read-only: list pending rows ready for
//                                   settlement, for the local fallback
//                                   script `scripts/settle-onchain.ts`
//   * POST /settle/record         — record the result of an oracle-signed
//                                   on-chain settle that was submitted
//                                   off-Worker (i.e. by the local script)
//   * POST /settle/record-expired — record the result of an oracle-signed
//                                   on-chain `expire_position` batch that
//                                   was submitted off-Worker (i.e. by
//                                   `scripts/expire-onchain.ts`)
//   * GET  /settle/status         — recent settlement runs + this-cycle
//                                   expire count, for the dashboard. Returns
//                                   a legacy ARRAY by default; pass
//                                   `?include=expired` for the wrapping
//                                   object `{ runs, expired_in_cycle }`.
//                                   The header `x-conexple-expired-in-cycle`
//                                   carries the count on both shapes.
//
// expireSweep(): permissionless `expire_position` cycle sweep — runs at
// the start of every scheduled settlement (BEFORE the commission settle
// loop) so any Position that lost activity status this cycle redirects
// its level commissions to the social pool per docs/02 §11. Same local-IP
// fallback model as the commission settle path.
//
// On-chain mechanics (V1 demo):
//   1. Find pending_commission rows where settle_at <= now AND status = 'pending'
//   2. Group by purchase_id (one tx per purchase, batching all upline credits)
//   3. For each purchase: read buyer + amount from D1, trace upline 5 hops
//      on-chain, build add_earnings instructions for each active ancestor
//   4. Submit one oracle-signed transaction per purchase
//   5. On success: mark all pending rows in the group settled and store the
//      on-chain signature so the dashboard can render Solscan links
//   6. On failure: mark rows failed and record the error
//
// Why we call `add_earnings` directly instead of the spec'd
// `escrow::execute_payout`:
//   * The escrow's settle_pending requires an initialized MerchantEscrow
//     PDA + funded vault. The hackathon devnet doesn't have these
//     initialized. We skip that and credit upline earnings on chain — the
//     credibility-load-bearing part of the pitch.
//   * `network::add_earnings` is the only path that mutates Position state
//     (docs/03 §4). Calling it from an oracle-signed tx is canonically the
//     same effect as the CPI from execute_payout.
//   * In V2, escrow.execute_payout will be a single tx that bundles
//     settle_pending (USDC transfer) + add_earnings (Position bump) per
//     recipient. The Position-state half is what we ship today.
//
// Why a `/settle/record` endpoint exists:
//   The public Solana devnet RPC (`api.devnet.solana.com`) blocks IPs from
//   the Cloudflare Workers range with HTTP 403, and the free-tier RPCs we
//   tried (`mango.devnet.rpcpool.com`, etc.) do the same. Without a paid
//   Helius or Triton API key — which would expand the V1 scope of this
//   prototype — the Worker cannot reach devnet directly. The local script
//   `scripts/settle-onchain.ts` does the on-chain submit from the
//   developer's IP and posts the resulting signature back here so the D1
//   audit trail stays correct.

import { Hono } from "hono";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Env } from "../env";
import { connection } from "../chain/connection";
import { loadOracleKeypair } from "../chain/oracle";
import { buildAddEarningsIx, submitAddEarnings } from "../chain/payout";
import { traceUpline } from "../chain/upline";
import {
  POSITION_ACCOUNT_SIZE,
  buildExpireIxs,
  chunkExpireIxs,
  decodePositionFull,
  isRpcBlocked,
  readCurrentCycleIndex,
  selectExpirable,
  submitExpireBatch,
} from "../chain/expire";
import { networkProgramId } from "../chain/pdas";
import { verifyHmac, requireAdminAuth } from "../lib/hmac";

export const settlementRoute = new Hono<{ Bindings: Env }>();

// /settle/run is admin-gated: requires HMAC of body in x-conexple-internal
// header. In demo mode (OPERATOR_DEMO_MODE=true) the check is skipped so
// hackathon judges can press the "Trigger cycle now" button. V2 production
// removes the env var to enforce auth.
settlementRoute.post("/run", async (c) => {
  const auth = await requireAdminAuth(c);
  if (!auth.ok) return c.json({ error: "unauthorized" }, 401);
  const result = await runScheduledSettlement(c.env, Date.now());
  return c.json(result);
});

settlementRoute.get("/status", async (c) => {
  const recent = await c.env.DB.prepare(
    "SELECT * FROM settlements ORDER BY submitted_at DESC LIMIT 10",
  ).all();
  // expired_in_cycle: count of `expire_position` oracle signatures emitted
  // within the most recent 24h cycle window. Sourced from oracle_audit
  // because the `positions` table schema doesn't carry an expired_at
  // timestamp; the audit log is the closest cycle-bucket source we have.
  //
  // Response-shape compatibility:
  //   * Default response is the legacy ARRAY of settlement rows (the
  //     existing dashboard at apps/web/src/app/operator/page.tsx relies on
  //     `.length`/`.map`).
  //   * `?include=expired` returns the wrapping object
  //     `{ runs: [...], expired_in_cycle: number }` so a future dashboard
  //     revision can surface the sweep result without a follow-up call.
  //   * The `x-conexple-expired-in-cycle` HTTP header carries the value on
  //     both shapes — clients that don't want to opt-in to the wrapping
  //     object can read the header instead.
  const cycleWindow = 24 * 60 * 60;
  const expiredCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oracle_audit
     WHERE ix_kind LIKE 'expire_position%'
       AND signed_at >= CAST(strftime('%s', 'now') AS INTEGER) - ?`,
  )
    .bind(cycleWindow)
    .first<{ n: number }>();
  const expired = expiredCount?.n ?? 0;
  c.header("x-conexple-expired-in-cycle", String(expired));
  const runs = recent.results ?? [];
  if (c.req.query("include") === "expired") {
    return c.json({ runs, expired_in_cycle: expired });
  }
  return c.json(runs);
});

settlementRoute.get("/pending", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const rows = await c.env.DB.prepare(
    `SELECT pc.id, pc.purchase_id, pc.recipient, pc.kind, pc.slot, pc.amount,
            pc.anchor_at, pc.settle_at, p.buyer, p.amount as purchase_amount
     FROM pending_commission pc
     JOIN purchases p ON p.id = pc.purchase_id
     WHERE pc.settle_at <= ? AND pc.status = 'pending' AND p.voided = 0
     ORDER BY pc.settle_at ASC LIMIT 200`,
  )
    .bind(now)
    .all();
  return c.json({ now, ready: rows.results ?? [] });
});

interface RecordPayload {
  purchase_id: string;
  signature: string;
  recipients: Array<{ wallet: string; level: number; amount: number }>;
}

// /settle/record is called only by scripts/settle-onchain.ts after the
// fallback local-IP signing path. Requires the same HMAC as /webhook/purchase
// to prevent forged settlement audit rows being injected by any internet
// caller. (Pre-submission security audit caught this — see SECURITY.md.)
settlementRoute.post("/record", async (c) => {
  const headerSig = c.req.header("x-conexple-internal");
  const raw = await c.req.text();
  if (
    !headerSig ||
    !c.env.PURCHASE_WEBHOOK_HMAC ||
    !(await verifyHmac(c.env.PURCHASE_WEBHOOK_HMAC, raw, headerSig))
  ) {
    return c.json({ error: "unauthorized" }, 401);
  }
  let body: RecordPayload;
  try {
    body = raw ? (JSON.parse(raw) as RecordPayload) : ({} as RecordPayload);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!body.purchase_id || !body.signature || !Array.isArray(body.recipients)) {
    return c.json({ error: "purchase_id, signature, recipients required" }, 400);
  }
  // Insert the level pending rows for the audit trail.
  const nowS = Math.floor(Date.now() / 1000);
  for (const r of body.recipients) {
    const id = `${body.purchase_id}:level${r.level}`;
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO pending_commission
       (id, purchase_id, network_id, recipient, kind, slot, amount, anchor_at, settle_at, status, onchain_pending_pubkey)
       VALUES (?, ?, ?, ?, 'level', ?, ?, ?, ?, 'settled', ?)`,
    )
      .bind(
        id,
        body.purchase_id,
        c.env.NETWORK_ID,
        r.wallet,
        Math.max(0, r.level - 1),
        r.amount,
        nowS,
        nowS,
        body.signature,
      )
      .run();
  }
  // Mark the pre-existing pending rows for this purchase as settled.
  const upd = await c.env.DB.prepare(
    `UPDATE pending_commission
     SET status = 'settled', onchain_pending_pubkey = ?
     WHERE purchase_id = ? AND status = 'pending'`,
  )
    .bind(body.signature, body.purchase_id)
    .run();
  // Audit log.
  await c.env.DB.prepare(
    "INSERT INTO oracle_audit (id, signed_at, caller, ix_kind, signature) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      nowS,
      "settle/record",
      `add_earnings×${body.recipients.length}`,
      body.signature,
    )
    .run();
  // Settlement run row.
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO settlements (id, network_id, cycle_index, submitted_at, total_paid, status)
     VALUES (?, ?, 0, ?, ?, ?)`,
  )
    .bind(
      body.signature,
      c.env.NETWORK_ID,
      nowS,
      body.recipients.length,
      "settled",
    )
    .run();
  return c.json({
    recorded: true,
    purchase_id: body.purchase_id,
    signature: body.signature,
    recipients: body.recipients.length,
    rows_marked_settled: upd.meta?.changes ?? null,
  });
});

// /settle/record-expired — called only by scripts/expire-onchain.ts after
// the fallback local-IP signing path. Mirrors the security model of
// /settle/record (HMAC-gated, body is the canonical message). Records the
// outcome in D1 so the dashboard's `expired_in_cycle` count reflects
// off-Worker submissions.
interface RecordExpiredPayload {
  signature: string;
  // List of wallets whose Position was just expired on chain via this tx.
  wallets: string[];
  // Optional — informational for the audit log; doesn't gate the update.
  cycles_inactive?: Record<string, number>;
}

settlementRoute.post("/record-expired", async (c) => {
  const headerSig = c.req.header("x-conexple-internal");
  const raw = await c.req.text();
  if (
    !headerSig ||
    !c.env.PURCHASE_WEBHOOK_HMAC ||
    !(await verifyHmac(c.env.PURCHASE_WEBHOOK_HMAC, raw, headerSig))
  ) {
    return c.json({ error: "unauthorized" }, 401);
  }
  let body: RecordExpiredPayload;
  try {
    body = raw ? (JSON.parse(raw) as RecordExpiredPayload) : ({} as RecordExpiredPayload);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!body.signature || !Array.isArray(body.wallets) || body.wallets.length === 0) {
    return c.json({ error: "signature + non-empty wallets[] required" }, 400);
  }
  const nowS = Math.floor(Date.now() / 1000);
  let updated = 0;
  for (const w of body.wallets) {
    const r = await c.env.DB.prepare(
      `UPDATE positions SET status = 'expired'
       WHERE network_id = ? AND wallet = ?`,
    )
      .bind(c.env.NETWORK_ID, w)
      .run();
    if (r.meta?.changes) updated += r.meta.changes;
  }
  await c.env.DB.prepare(
    "INSERT INTO oracle_audit (id, signed_at, caller, ix_kind, signature) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      nowS,
      "settle/record-expired",
      `expire_position×${body.wallets.length}`,
      body.signature,
    )
    .run();
  return c.json({
    recorded: true,
    signature: body.signature,
    wallets: body.wallets.length,
    rows_updated: updated,
  });
});

interface PendingRow {
  id: string;
  purchase_id: string;
  network_id: string;
  recipient: string;
  kind: string;
  slot: number;
  amount: number;
}

interface PurchaseRow {
  id: string;
  buyer: string;
  amount: number;
  voided: number;
}

export interface ExpireSweepResult {
  expired_count: number;
  tx_signatures: string[];
  degraded?: boolean;
  reason?: string;
  candidates_seen?: number;
}

/**
 * Sweep the network for Positions eligible to expire and submit oracle-paid
 * `expire_position` transactions for each, batched ~8 per tx.
 *
 * Returns `{ expired_count, tx_signatures, degraded }`. When the Worker's
 * IP is blocked by the public Solana RPC (HTTP 403 — the same problem the
 * commission settle path has), the function returns `{ degraded: true,
 * expired_count: 0 }` and the local fallback script `scripts/expire-onchain.ts`
 * picks up the work on the developer's IP.
 *
 * Idempotency: candidates with `status='expired'` are filtered before any
 * tx is built; an already-expired Position will never be re-submitted.
 */
export async function expireSweep(env: Env): Promise<ExpireSweepResult> {
  const conn = connection(env);

  // 1. Fetch all Position accounts via getProgramAccounts. This is the
  //    operation that 403s on Cloudflare Worker IPs against the public
  //    devnet RPC.
  let positions;
  try {
    positions = await conn.getProgramAccounts(networkProgramId(env), {
      commitment: "confirmed",
      filters: [{ dataSize: POSITION_ACCOUNT_SIZE }],
    });
  } catch (err) {
    if (isRpcBlocked(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[expireSweep] RPC blocked (${msg.slice(0, 100)}) — degraded`);
      return {
        expired_count: 0,
        tx_signatures: [],
        degraded: true,
        reason: "rpc-blocked",
      };
    }
    throw err;
  }

  if (positions.length === 0) {
    return { expired_count: 0, tx_signatures: [], candidates_seen: 0 };
  }

  // 2. Read current cycle from NetworkState.
  let currentRound: bigint;
  try {
    currentRound = await readCurrentCycleIndex(conn, env);
  } catch (err) {
    if (isRpcBlocked(err)) {
      return {
        expired_count: 0,
        tx_signatures: [],
        degraded: true,
        reason: "rpc-blocked",
      };
    }
    throw err;
  }

  // 3. Decode + filter.
  const full = [];
  for (const { pubkey, account } of positions) {
    try {
      full.push(decodePositionFull(pubkey, Buffer.from(account.data)));
    } catch {
      // skip undecodable accounts
    }
  }
  const candidates = selectExpirable(full, currentRound, 1);
  if (candidates.length === 0) {
    return { expired_count: 0, tx_signatures: [], candidates_seen: 0 };
  }

  // Only the inactivity candidates are eligible for the permissionless
  // `expire_position` ix. Cap-only candidates need `force_expire` (admin
  // signer) which is wired separately in apps/operator/src/workers/merchant.ts
  // by Agent I — surface them in the count but don't submit here.
  const inactivityCandidates = candidates.filter((c) => c.reason === "inactivity");
  if (inactivityCandidates.length === 0) {
    return {
      expired_count: 0,
      tx_signatures: [],
      candidates_seen: candidates.length,
    };
  }

  // 4. Load oracle (fee payer) and build/send batched ixs.
  let oracle;
  try {
    oracle = loadOracleKeypair(env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      expired_count: 0,
      tx_signatures: [],
      degraded: true,
      reason: `oracle-key-unavailable: ${msg.slice(0, 100)}`,
    };
  }

  const ixs = buildExpireIxs(inactivityCandidates, env);
  const batches = chunkExpireIxs(ixs, 8);
  const sigs: string[] = [];
  let confirmedCount = 0;
  const nowS = Math.floor(Date.now() / 1000);

  // Track candidate per ix so we can map confirmed batches → D1 updates.
  const candidatesByBatch: typeof inactivityCandidates[] = [];
  for (let i = 0; i < inactivityCandidates.length; i += 8) {
    candidatesByBatch.push(inactivityCandidates.slice(i, i + 8));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!;
    const batchCandidates = candidatesByBatch[bi]!;
    try {
      const sig = await submitExpireBatch(conn, oracle, batch, "confirmed");
      sigs.push(sig);
      confirmedCount += batchCandidates.length;

      // D1 update — on-chain authoritative, then mirror.
      for (const c of batchCandidates) {
        await env.DB.prepare(
          `UPDATE positions SET status = 'expired'
           WHERE network_id = ? AND wallet = ?`,
        )
          .bind(env.NETWORK_ID, c.position.wallet.toBase58())
          .run();
      }

      // Audit log — `expire_position×N` so /settle/status can count.
      await env.DB.prepare(
        "INSERT INTO oracle_audit (id, signed_at, caller, ix_kind, signature) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(
          crypto.randomUUID(),
          nowS,
          "scheduler/expireSweep",
          `expire_position×${batch.length}`,
          sig,
        )
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isRpcBlocked(err)) {
        // Whole sweep is degraded — bail and let the local script handle.
        console.warn(`[expireSweep] batch ${bi} RPC blocked — degraded`);
        return {
          expired_count: confirmedCount,
          tx_signatures: sigs,
          degraded: true,
          reason: "rpc-blocked",
        };
      }
      console.error(`[expireSweep] batch ${bi} failed:`, msg);
      // Continue with subsequent batches — partial sweep is better than none.
    }
  }

  return {
    expired_count: confirmedCount,
    tx_signatures: sigs,
    candidates_seen: candidates.length,
  };
}

export async function runScheduledSettlement(env: Env, scheduledTime: number) {
  const now = Math.floor(scheduledTime / 1000);

  // 0. Expiry sweep — find & rotate inactive Positions before settling the
  //    cycle's commissions. Rotation that lands BEFORE settle ensures any
  //    Position that lost active status this cycle redirects its level
  //    commissions to the social pool (docs/02 §11), which the settle path
  //    already honours via `traceUpline`'s status check.
  let sweep: ExpireSweepResult = { expired_count: 0, tx_signatures: [] };
  try {
    sweep = await expireSweep(env);
    console.log("[runScheduledSettlement] expireSweep:", JSON.stringify(sweep));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[runScheduledSettlement] expireSweep threw:", msg);
    sweep = { expired_count: 0, tx_signatures: [], degraded: true, reason: msg.slice(0, 200) };
  }

  // 1. Pending rows ready for settlement.
  const pending = await env.DB.prepare(
    `SELECT * FROM pending_commission
     WHERE settle_at <= ? AND status = 'pending'
     ORDER BY settle_at ASC LIMIT 200`,
  )
    .bind(now)
    .all<PendingRow>();

  const rows = pending.results ?? [];
  if (rows.length === 0) {
    return {
      settled: 0,
      failed: 0,
      skipped: 0,
      signatures: [] as string[],
      message: "no pending rows ready",
      sweep,
    };
  }

  // 2. Group by purchase_id.
  const byPurchase = new Map<string, PendingRow[]>();
  for (const r of rows) {
    const list = byPurchase.get(r.purchase_id) ?? [];
    list.push(r);
    byPurchase.set(r.purchase_id, list);
  }

  const conn = connection(env);
  let oracle;
  try {
    oracle = loadOracleKeypair(env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      settled: 0,
      failed: 0,
      skipped: rows.length,
      signatures: [] as string[],
      error: `oracle keypair unavailable: ${msg}`,
    };
  }

  let settled = 0;
  let failed = 0;
  const signatures: string[] = [];
  const errors: string[] = [];

  for (const [purchaseId, group] of byPurchase) {
    try {
      const sig = await settleOnePurchase(env, conn, oracle, purchaseId, group);
      if (sig) {
        signatures.push(sig);
      }
      settled += group.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`settle ${purchaseId} failed:`, msg);
      errors.push(`${purchaseId}: ${msg.slice(0, 200)}`);
      failed += group.length;
      await env.DB.prepare(
        `UPDATE pending_commission SET status = 'failed' WHERE purchase_id = ? AND status = 'pending'`,
      )
        .bind(purchaseId)
        .run();
    }
  }

  // Record settlement run.
  const settlementId = signatures[0] ?? `cron-${now}`;
  const status = failed === 0 ? "settled" : (settled === 0 ? "failed" : "partial");
  await env.DB.prepare(
    `INSERT OR IGNORE INTO settlements (id, network_id, cycle_index, submitted_at, total_paid, status, error)
     VALUES (?, ?, 0, ?, ?, ?, ?)`,
  )
    .bind(
      settlementId,
      env.NETWORK_ID,
      now,
      settled,
      status,
      errors.length ? errors.join(" | ").slice(0, 500) : null,
    )
    .run();

  return {
    settled,
    failed,
    skipped: 0,
    signatures,
    settlement_id: settlementId,
    errors: errors.length ? errors : undefined,
    sweep,
  };
}

/**
 * Settle every pending row for a single purchase by:
 *   1. Looking up the buyer + amount in `purchases`.
 *   2. Tracing the buyer's on-chain upline (1..5 hops).
 *   3. Building one add_earnings ix per active ancestor.
 *   4. Submitting one oracle-signed tx; awaiting confirmation.
 *   5. Marking all pending rows in the group settled (with the signature).
 *
 * Returns the on-chain tx signature, or null if no on-chain ix was needed.
 */
async function settleOnePurchase(
  env: Env,
  conn: Connection,
  oracle: ReturnType<typeof loadOracleKeypair>,
  purchaseId: string,
  _group: PendingRow[],
): Promise<string | null> {
  const purchase = await env.DB.prepare(
    "SELECT id, buyer, amount, voided FROM purchases WHERE id = ?",
  )
    .bind(purchaseId)
    .first<PurchaseRow>();

  if (!purchase) {
    throw new Error(`purchase ${purchaseId} not found`);
  }
  if (purchase.voided) {
    await env.DB.prepare(
      `UPDATE pending_commission SET status = 'voided' WHERE purchase_id = ? AND status = 'pending'`,
    )
      .bind(purchaseId)
      .run();
    return null;
  }

  const buyerKey = new PublicKey(purchase.buyer);
  const upline = await traceUpline(conn, env, buyerKey, 5);

  // 50% margin / 7 slots
  const margin = Math.floor(purchase.amount / 2);
  const perSlot = Math.floor(margin / 7);

  if (perSlot <= 0) {
    await env.DB.prepare(
      `UPDATE pending_commission SET status = 'settled' WHERE purchase_id = ? AND status = 'pending'`,
    )
      .bind(purchaseId)
      .run();
    return null;
  }

  const ixs: TransactionInstruction[] = [];
  const creditedRecipients: Array<{ wallet: string; level: number }> = [];
  for (const hop of upline) {
    if (hop.status !== "active") continue;
    ixs.push(buildAddEarningsIx(env, hop.wallet, oracle.publicKey, BigInt(perSlot)));
    creditedRecipients.push({ wallet: hop.wallet.toBase58(), level: hop.level });
  }

  if (ixs.length === 0) {
    await env.DB.prepare(
      `UPDATE pending_commission SET status = 'settled' WHERE purchase_id = ? AND status = 'pending'`,
    )
      .bind(purchaseId)
      .run();
    return null;
  }

  const sig = await submitAddEarnings(conn, oracle, ixs, "confirmed");

  // Persist level pending rows that didn't exist (the V1 webhook only
  // created the social_pool slot — backfill levels here so the audit trail
  // is complete in D1 too).
  const nowS = Math.floor(Date.now() / 1000);
  for (const cr of creditedRecipients) {
    const id = `${purchaseId}:level${cr.level}`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO pending_commission
       (id, purchase_id, network_id, recipient, kind, slot, amount, anchor_at, settle_at, status, onchain_pending_pubkey)
       VALUES (?, ?, ?, ?, 'level', ?, ?, ?, ?, 'settled', ?)`,
    )
      .bind(
        id,
        purchaseId,
        env.NETWORK_ID,
        cr.wallet,
        Math.max(0, cr.level - 1),
        perSlot,
        nowS,
        nowS,
        sig,
      )
      .run();
  }

  await env.DB.prepare(
    `UPDATE pending_commission
     SET status = 'settled', onchain_pending_pubkey = ?
     WHERE purchase_id = ? AND status = 'pending'`,
  )
    .bind(sig, purchaseId)
    .run();

  await env.DB.prepare(
    "INSERT INTO oracle_audit (id, signed_at, caller, ix_kind, signature) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      nowS,
      "scheduler/settle",
      `add_earnings×${ixs.length}`,
      sig,
    )
    .run();

  return sig;
}

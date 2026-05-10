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
//   * GET  /settle/status         — recent settlement runs, for the
//                                   dashboard
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

export const settlementRoute = new Hono<{ Bindings: Env }>();

settlementRoute.post("/run", async (c) => {
  const result = await runScheduledSettlement(c.env, Date.now());
  return c.json(result);
});

settlementRoute.get("/status", async (c) => {
  const recent = await c.env.DB.prepare(
    "SELECT * FROM settlements ORDER BY submitted_at DESC LIMIT 10",
  ).all();
  return c.json(recent.results ?? []);
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

settlementRoute.post("/record", async (c) => {
  let body: RecordPayload;
  try {
    body = await c.req.json<RecordPayload>();
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

export async function runScheduledSettlement(env: Env, scheduledTime: number) {
  const now = Math.floor(scheduledTime / 1000);

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

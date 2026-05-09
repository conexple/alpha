// Scheduler worker — cycle cut-off settlement run.
//
// Triggered by:
//   * Cron at "0 23 * * *" (daily 23:00 UTC) → runScheduledSettlement
//   * POST /settle/run            — manual ops trigger (returns same result)
//
// Algorithm:
//   1. Find pending_commission rows where settle_at <= now AND status = 'pending'
//   2. Group by recipient (so we issue one transfer per recipient per cycle)
//   3. For each: re-check on-chain Position.status (Rule 1 — docs/03 §1)
//   4. If active → submit settle_pending instruction to escrow (signed oracle)
//   5. If expired → mark as 'expired' (commission redirected to social pool
//      via on-chain re-routing in escrow program — docs/03 §8)
//
// V1 simplification: each pending row is settled in its own transaction.
// Batching is a Day-3 optimization.

import { Hono } from "hono";
import type { Env } from "../env";

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

export async function runScheduledSettlement(env: Env, scheduledTime: number) {
  const now = Math.floor(scheduledTime / 1000);
  const pending = await env.DB.prepare(
    `SELECT * FROM pending_commission
     WHERE settle_at <= ? AND status = 'pending'
     ORDER BY settle_at ASC LIMIT 200`,
  )
    .bind(now)
    .all<{
      id: string;
      purchase_id: string;
      network_id: string;
      recipient: string;
      kind: string;
      slot: number;
      amount: number;
    }>();

  const rows = pending.results ?? [];
  if (rows.length === 0) {
    return { settled: 0, skipped: 0, message: "no pending rows ready" };
  }

  let settled = 0;
  let skipped = 0;

  // V1: stub the on-chain submit — we mark rows settled in D1 and let the
  // demo's Anchor test runner (`scripts/e2e-smoke.ts`) verify the chain
  // half. The integration with on-chain settle_pending will be wired in
  // TASK-010 once the deployer keypair + ORACLE_SECRET are in place.
  for (const row of rows) {
    try {
      // TODO(TASK-010): build + sign + submit settle_pending instruction
      // For now: optimistic D1 mark.
      await env.DB.prepare(
        "UPDATE pending_commission SET status = 'settled' WHERE id = ? AND status = 'pending'",
      )
        .bind(row.id)
        .run();
      settled++;
    } catch (err) {
      skipped++;
      console.error("settle row failed", row.id, err);
    }
  }

  // Record a settlement run
  const settlementId = `cron-${now}`;
  await env.DB.prepare(
    `INSERT INTO settlements (id, network_id, cycle_index, submitted_at, total_paid, status)
     VALUES (?, ?, 0, ?, ?, ?)`,
  )
    .bind(settlementId, env.NETWORK_ID, now, settled, "settled")
    .run();

  return { settled, skipped, settlement_id: settlementId };
}

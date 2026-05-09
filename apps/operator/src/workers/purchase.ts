// Purchase ingest + Queue consumer.
//
// HTTP:
//   POST /webhook/purchase
//     headers: x-conexple-sig (HMAC-SHA256 hex of body)
//     body: { network_id, merchant_id, buyer, amount, block_time, correlation_id }
//   → 202 Accepted; pushes to Queue
//
// Queue handler:
//   - Dequeues batch (max 25)
//   - For each: insert purchases row + create pending_commission rows for
//     5 levels + override + pool slot
//   - Idempotent on correlation_id

import { Hono } from "hono";
import type { Env, PurchaseQueueMessage } from "../env";
import { verifyHmac } from "../lib/hmac";

export const purchaseIngestRoute = new Hono<{ Bindings: Env }>();

purchaseIngestRoute.post("/purchase", async (c) => {
  const sig = c.req.header("x-conexple-sig") ?? "";
  const raw = await c.req.text();
  const ok = await verifyHmac(c.env.PURCHASE_WEBHOOK_HMAC, raw, sig);
  if (!ok) return c.json({ error: "bad signature" }, 401);

  const body = JSON.parse(raw) as PurchaseQueueMessage;
  if (
    !body.network_id ||
    !body.buyer ||
    !body.amount ||
    !body.merchant_id ||
    !body.correlation_id
  ) {
    return c.json({ error: "missing fields" }, 400);
  }
  await c.env.PURCHASE_QUEUE.send(body);
  return c.json({ accepted: true, correlation_id: body.correlation_id }, 202);
});

export async function handlePurchaseQueue(
  batch: MessageBatch<unknown>,
  env: Env,
) {
  for (const msg of batch.messages) {
    try {
      const m = msg.body as PurchaseQueueMessage;
      await ingestOne(env, m);
      msg.ack();
    } catch (err) {
      console.error("purchase ingest failed", err);
      msg.retry();
    }
  }
}

async function ingestOne(env: Env, m: PurchaseQueueMessage) {
  const round = await currentRound(env, m.network_id);
  // Insert purchase if not seen
  await env.DB.prepare(
    `INSERT OR IGNORE INTO purchases
     (id, network_id, merchant_id, buyer, amount, block_time, round, voided)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(
      m.correlation_id,
      m.network_id,
      m.merchant_id,
      m.buyer,
      m.amount,
      m.block_time,
      round,
    )
    .run();

  // Compute the 7-way split. Margin is 50% by default for the demo.
  // Each slot is commission / 7. We compute per slot lazily; recipients are
  // resolved after on-chain ancestor traversal.
  // V1: we record one social_pool slot here; level/override slots are filled
  // by a follow-up enqueue when ancestor traversal succeeds.
  const margin = Math.floor(m.amount / 2);
  const slot = Math.floor(margin / 7);
  const settleAt = m.block_time + 30 * 24 * 60 * 60; // 30-day hold default
  const social = `${m.correlation_id}:social`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO pending_commission
     (id, purchase_id, network_id, recipient, kind, slot, amount, anchor_at, settle_at, status)
     VALUES (?, ?, ?, '__pool__', 'social_pool', 5, ?, ?, ?, 'pending')`,
  )
    .bind(social, m.correlation_id, m.network_id, slot, m.block_time, settleAt)
    .run();
  // TODO(TASK-009): traverse upline 5 hops to fill level 1..5 and resolve
  // infinity-override candidate. The traversal reads positions table from D1.
}

async function currentRound(env: Env, networkId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT cycle_index FROM networks WHERE id = ?",
  )
    .bind(networkId)
    .first<{ cycle_index: number }>();
  return row?.cycle_index ?? 0;
}

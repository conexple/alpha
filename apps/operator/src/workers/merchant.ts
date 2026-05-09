// Merchant ops route — `/merchant/*` endpoints surfaced to the merchant
// dashboard page on the frontend.
//
// V1 scope (demo-only):
//   POST /merchant/void           { merchant_id, purchase_id }
//     - Marks pending_commission rows for that purchase_id as 'voided' in D1.
//     - In production, this would also CPI conexple_escrow::void_purchase
//       on-chain. V1 stubs that step.
//   POST /merchant/force-expire   { merchant_id, wallet }
//     - Marks the position 'expired' in D1.
//     - Production version would CPI conexple_network::force_expire.

import { Hono } from "hono";
import type { Env } from "../env";

export const merchantRoute = new Hono<{ Bindings: Env }>();

merchantRoute.post("/void", async (c) => {
  const body = await c.req.json<{ merchant_id: string; purchase_id: string }>();
  if (!body.merchant_id || !body.purchase_id) {
    return c.json({ error: "merchant_id + purchase_id required" }, 400);
  }
  const before = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM pending_commission WHERE purchase_id = ? AND status = 'pending'`,
  )
    .bind(body.purchase_id)
    .first<{ n: number }>();
  await c.env.DB.prepare(
    `UPDATE pending_commission SET status = 'voided' WHERE purchase_id = ? AND status = 'pending'`,
  )
    .bind(body.purchase_id)
    .run();
  await c.env.DB.prepare(
    `UPDATE purchases SET voided = 1 WHERE id = ?`,
  )
    .bind(body.purchase_id)
    .run();
  return c.json({ voided_rows: before?.n ?? 0, purchase_id: body.purchase_id });
});

merchantRoute.post("/force-expire", async (c) => {
  const body = await c.req.json<{ merchant_id: string; wallet: string }>();
  if (!body.merchant_id || !body.wallet) {
    return c.json({ error: "merchant_id + wallet required" }, 400);
  }
  await c.env.DB.prepare(
    `UPDATE positions SET status = 'expired' WHERE network_id = ? AND wallet = ?`,
  )
    .bind(c.env.NETWORK_ID, body.wallet)
    .run();
  return c.json({ wallet: body.wallet, status: "expired" });
});

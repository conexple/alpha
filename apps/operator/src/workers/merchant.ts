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
//   GET  /merchant/list
//     - Lists every MerchantEscrow PDA on the configured network by issuing
//       a getProgramAccounts call against the escrow program. Augments with
//       hardcoded off-chain display metadata (name, margin_bps).

import { Hono } from "hono";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Env } from "../env";
import { connection } from "../chain/connection";
import { escrowProgramId, networkId } from "../chain/pdas";

export const merchantRoute = new Hono<{ Bindings: Env }>();

// MerchantEscrow byte layout (matches state::MerchantEscrow::SIZE):
//   8   discriminator
//   1   bump
//   8   network_id        (u64 LE)
//   8   merchant_id       (u64 LE)
//   32  merchant pubkey
//   32  vault pubkey
//   8   deposited_total   (u64 LE)
//   8   paid_out_total    (u64 LE)
//   8   voided_total      (u64 LE)
//   32  padding
const MERCHANT_ESCROW_SIZE = 145;

// Off-chain display metadata. Merchants 02 / 03 are seeded by
// scripts/init-merchant.ts; merchant 04 is seeded by
// scripts/init-merchant-byok.ts using a third-party (non-deployer) keypair;
// merchant 01 was the original hardcoded demo.
// Keep this map in sync with apps/web/src/app/merchant/page.tsx.
const DISPLAY_META: Record<string, { name: string; margin_bps: number }> = {
  "1": { name: "Demo Merchant 01", margin_bps: 5000 },
  "2": { name: "Demo Merchant 02", margin_bps: 4500 },
  "3": { name: "Demo Merchant 03", margin_bps: 3000 },
  "4": { name: "Demo Merchant 04 (BYOK)", margin_bps: 2500 },
};

function readU64Le(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

interface MerchantSummary {
  merchant_id: string;
  name: string;
  margin_bps: number;
  pda: string;
  vault: string;
  vault_balance_base_units: string;
  deposited_total: string;
  paid_out_total: string;
  voided_total: string;
}

async function listMerchants(env: Env): Promise<MerchantSummary[]> {
  const conn: Connection = connection(env);
  const programId = escrowProgramId(env);
  const targetNetworkId = networkId(env);

  const accounts = await conn.getProgramAccounts(programId, {
    commitment: "confirmed",
    filters: [{ dataSize: MERCHANT_ESCROW_SIZE }],
  });

  const summaries: MerchantSummary[] = [];
  for (const { pubkey, account } of accounts) {
    const data = Buffer.from(account.data);
    if (data.length < MERCHANT_ESCROW_SIZE) continue;
    const acctNetworkId = readU64Le(data, 8 + 1);
    if (acctNetworkId !== targetNetworkId) continue;
    const merchantId = readU64Le(data, 8 + 1 + 8);
    const merchantPk = new PublicKey(data.subarray(8 + 1 + 8 + 8, 8 + 1 + 8 + 8 + 32));
    void merchantPk; // accepted but not surfaced — keeps the layout audit-friendly
    const vaultPk = new PublicKey(
      data.subarray(8 + 1 + 8 + 8 + 32, 8 + 1 + 8 + 8 + 32 + 32),
    );
    const deposited = readU64Le(data, 8 + 1 + 8 + 8 + 32 + 32);
    const paidOut = readU64Le(data, 8 + 1 + 8 + 8 + 32 + 32 + 8);
    const voided = readU64Le(data, 8 + 1 + 8 + 8 + 32 + 32 + 8 + 8);

    let vaultBalance = "0";
    try {
      const bal = await conn.getTokenAccountBalance(vaultPk);
      vaultBalance = bal.value.amount;
    } catch {
      // vault may exist but RPC can flake; fall through with 0
    }

    const idStr = merchantId.toString();
    const meta = DISPLAY_META[idStr] ?? {
      name: `Merchant ${idStr}`,
      margin_bps: 5000,
    };
    summaries.push({
      merchant_id: idStr,
      name: meta.name,
      margin_bps: meta.margin_bps,
      pda: pubkey.toBase58(),
      vault: vaultPk.toBase58(),
      vault_balance_base_units: vaultBalance,
      deposited_total: deposited.toString(),
      paid_out_total: paidOut.toString(),
      voided_total: voided.toString(),
    });
  }

  // Stable order by merchant_id ascending.
  summaries.sort((a, b) => Number(BigInt(a.merchant_id) - BigInt(b.merchant_id)));
  return summaries;
}

merchantRoute.get("/list", async (c) => {
  try {
    const merchants = await listMerchants(c.env);
    return c.json({ network_id: c.env.NETWORK_ID, merchants });
  } catch (err) {
    // Free Solana RPCs (api.devnet, public.helius free tier) reject Cloudflare
    // Worker IPs with HTTP 403 on getProgramAccounts. Don't 500 the merchant
    // page over it — fall back to the hardcoded display metadata so the
    // dropdown still renders. Surface the failure via `degraded: true` so the
    // frontend can choose to dim the vault-balance column.
    const fallback = Object.entries(DISPLAY_META).map(([id, meta]) => ({
      merchant_id: id,
      name: meta.name,
      margin_bps: meta.margin_bps,
      pda: "",
      vault: "",
      vault_balance_base_units: "?",
      deposited_total: "?",
      paid_out_total: "?",
      voided_total: "?",
    }));
    return c.json({
      network_id: c.env.NETWORK_ID,
      merchants: fallback,
      degraded: true,
      degraded_reason: String(err).slice(0, 200),
    });
  }
});

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

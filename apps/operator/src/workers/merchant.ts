// Merchant ops route — `/merchant/*` endpoints surfaced to the merchant
// dashboard page on the frontend.
//
// V1 scope (demo-only):
//   POST /merchant/void           { merchant_id, purchase_id }
//     - Marks pending_commission rows for that purchase_id as 'voided' in D1.
//     - In production, this would also CPI conexple_escrow::void_purchase
//       on-chain. V1 stubs that step.
//   POST /merchant/force-expire   { merchant_id, wallet }
//     - Submits oracle-signed conexple_network::force_expire(wallet) on chain.
//     - On success: D1 mirror updated to status='expired'.
//     - On RPC failure: returns 503 with a hint to use the local fallback script.
//   GET  /merchant/list
//     - Lists every MerchantEscrow PDA on the configured network by issuing
//       a getProgramAccounts call against the escrow program. Augments with
//       hardcoded off-chain display metadata (name, margin_bps).

import { Hono } from "hono";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Env } from "../env";
import { connection } from "../chain/connection";
import {
  escrowProgramId,
  networkId,
  networkPda,
  networkProgramId,
  positionPda,
} from "../chain/pdas";
import { loadOracleKeypair } from "../chain/oracle";
import { requireAdminAuth } from "../lib/hmac";

// Anchor instruction discriminator for `force_expire`, copied verbatim from
// packages/sdk/src/idl/conexple_network.json. Hard-coded so we do not pay the
// cost of shipping the full IDL into the Worker bundle. Mirrors the
// ADD_EARNINGS_DISCRIMINATOR pattern in chain/payout.ts.
const FORCE_EXPIRE_DISCRIMINATOR = Buffer.from([
  181, 233, 225, 150, 213, 57, 145, 169,
]);

// Known on-chain error codes from programs/conexple-network/src/error.rs we
// can map back to friendly messages. Anchor surfaces program errors as
// "custom program error: 0x<hex>" inside SendTransactionError messages.
const NETWORK_ERROR_MESSAGES: Record<string, string> = {
  "0x1778": "position is not active (already expired)",  // 6008 PositionNotActive
  "0x177a": "signer is not the network admin authority", // 6010 UnauthorizedAdmin
};

function explainAnchorError(msg: string): { code: string; reason: string } | null {
  const match = /custom program error:\s*(0x[0-9a-fA-F]+)/.exec(msg);
  if (!match || !match[1]) return null;
  const code = match[1].toLowerCase();
  const reason = NETWORK_ERROR_MESSAGES[code];
  if (!reason) return null;
  return { code, reason };
}

// Best-effort classifier: was the failure caused by the Worker IP being
// unable to reach a Solana RPC endpoint (the dominant failure mode), as
// opposed to a real on-chain rejection? Free Solana devnet RPCs block CF
// Workers' IPs with HTTP 403; we route those to the local fallback script
// rather than reporting them as 500s.
function isRpcUnreachable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b(403|429|502|503|504)\b/.test(msg) ||
    /failed to fetch|fetch failed|ENOTFOUND|ECONNRESET|TypeError: fetch/i.test(msg) ||
    /blockhash not found/i.test(msg)
  );
}

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
  "5": { name: "Demo Merchant 05 (BYOK)", margin_bps: 4000 },
  "6": { name: "Demo Merchant 06 (BYOK)", margin_bps: 3500 },
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
      degraded_reason: "rpc-unavailable",
    });
  }
});

// /void + /force-expire are admin-gated: require HMAC of body in
// x-conexple-internal header. In demo mode (OPERATOR_DEMO_MODE=true) the
// check is skipped so hackathon judges can press dashboard buttons.
// V2 production removes the env var to enforce auth.
merchantRoute.post("/void", async (c) => {
  const auth = await requireAdminAuth(c);
  if (!auth.ok) return c.json({ error: "unauthorized" }, 401);
  let body: { merchant_id: string; purchase_id: string };
  try {
    body = auth.raw ? JSON.parse(auth.raw) : ({} as never);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
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

/**
 * Build the conexple_network::force_expire instruction for a given wallet.
 *
 * Accounts (per programs/conexple-network/src/lib.rs `ForceExpire`):
 *   0. network          — NetworkState PDA (readonly)
 *   1. position         — Position PDA for `wallet` (writable)
 *   2. authority        — signer; on-chain handler checks key == network.admin
 *
 * No args (the Position is derived from the PDA seeds).
 *
 * NOTE: the network's admin (set by initialize_network) is the deployer
 * keypair, NOT the oracle. In V1 the Worker only has ORACLE_SECRET, so this
 * tx will fail with UnauthorizedAdmin (6010) when the two keys differ — in
 * which case the operator falls back to the local script
 * (scripts/expire-onchain.ts) signed by the admin keypair from
 * keys/devnet-deployer.json. The handler below maps that error to a 400
 * with a friendly hint.
 */
function buildForceExpireIx(
  env: Env,
  wallet: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  const [netPda] = networkPda(env);
  const [posPda] = positionPda(env, wallet);

  const data = Buffer.alloc(8);
  FORCE_EXPIRE_DISCRIMINATOR.copy(data, 0);

  return new TransactionInstruction({
    programId: networkProgramId(env),
    keys: [
      { pubkey: netPda, isSigner: false, isWritable: false },
      { pubkey: posPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

// Position account discriminator (from IDL) — used to confirm the bytes at
// the Position PDA are actually a Position struct before we read the status
// byte.
const POSITION_DISCRIMINATOR = Buffer.from([
  170, 188, 143, 228, 122, 64, 247, 208,
]);

// Read just the `status` byte from a Position account buffer. Layout from
// programs/conexple-network/src/state.rs::Position (and verified by the
// upline.ts decoder):
//   8   discriminator
//   1   bump
//   8   network_id
//   32  wallet
//   1   parent tag    (Option<Pubkey>)
//   32  parent pubkey ONLY if parent tag == 1
//   1   depth
//   1   status        ← what we want
function readPositionStatus(data: Buffer): "active" | "expired" | null {
  if (data.length < 8 + 1 + 8 + 32 + 1 + 1 + 1) return null;
  if (!data.subarray(0, 8).equals(POSITION_DISCRIMINATOR)) return null;
  let cur = 8 + 1 + 8 + 32; // skip disc, bump, network_id, wallet
  const parentTag = data.readUInt8(cur);
  cur += 1;
  if (parentTag === 1) cur += 32;
  cur += 1; // depth
  const statusByte = data.readUInt8(cur);
  return statusByte === 0 ? "active" : "expired";
}

// Loose base58 sanity check (avoids feeding garbage into PublicKey, which
// throws synchronously). Solana pubkeys are 32 bytes → 43–44 base58 chars.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

merchantRoute.post("/force-expire", async (c) => {
  const auth = await requireAdminAuth(c);
  if (!auth.ok) return c.json({ error: "unauthorized" }, 401);
  let body: { merchant_id: string; wallet: string };
  try {
    body = auth.raw ? JSON.parse(auth.raw) : ({} as never);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!body.merchant_id || !body.wallet) {
    return c.json({ error: "merchant_id + wallet required" }, 400);
  }
  if (!/^\d+$/.test(body.merchant_id)) {
    return c.json({ error: "merchant_id must be numeric" }, 400);
  }
  if (!BASE58_RE.test(body.wallet)) {
    return c.json({ error: "wallet is not a valid base58 pubkey" }, 400);
  }

  let walletKey: PublicKey;
  try {
    walletKey = new PublicKey(body.wallet);
  } catch {
    return c.json({ error: "wallet is not a valid base58 pubkey" }, 400);
  }

  const conn = connection(c.env);
  const [posPda] = positionPda(c.env, walletKey);

  // ── Pre-flight: read Position to short-circuit idempotently ───────────────
  // If we can't reach the RPC at all, fall straight through to the 503 hint.
  // We don't want to block the operator's path with a transient pre-flight
  // failure — but we DO want to avoid burning a tx if the position is
  // already expired on-chain.
  try {
    const info = await conn.getAccountInfo(posPda, "confirmed");
    if (!info) {
      return c.json(
        { error: "position not found on chain", wallet: body.wallet },
        404,
      );
    }
    const status = readPositionStatus(Buffer.from(info.data));
    if (status === "expired") {
      // Make sure D1 reflects the on-chain truth, then return idempotent OK.
      await c.env.DB.prepare(
        `UPDATE positions SET status = 'expired' WHERE network_id = ? AND wallet = ?`,
      )
        .bind(c.env.NETWORK_ID, body.wallet)
        .run();
      return c.json({ wallet: body.wallet, status: "already-expired" });
    }
  } catch (err) {
    if (isRpcUnreachable(err)) {
      return c.json(
        {
          error: "RPC unavailable from Worker IP",
          hint: "Run scripts/expire-onchain.ts --wallet <pubkey> from your local machine",
          wallet: body.wallet,
        },
        503,
      );
    }
    // Non-RPC pre-flight failure: log and continue to attempt the tx so the
    // submit path can produce the canonical error.
    console.warn("force-expire pre-flight read failed:", err);
  }

  // ── Load signer ──────────────────────────────────────────────────────────
  let oracle;
  try {
    oracle = loadOracleKeypair(c.env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `signer unavailable: ${msg}` }, 500);
  }

  // ── Build + submit ───────────────────────────────────────────────────────
  const ix = buildForceExpireIx(c.env, walletKey, oracle.publicKey);
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
    .add(ix);

  let sig: string;
  try {
    sig = await sendAndConfirmTransaction(conn, tx, [oracle], {
      commitment: "confirmed",
      skipPreflight: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Known program error → 400 with friendly message. Do NOT touch D1.
    const explained = explainAnchorError(msg);
    if (explained) {
      const hint =
        explained.code === "0x177a"
          ? " — the V1 Worker signs with the oracle key, but on-chain force_expire requires the admin (deployer) key. Use scripts/expire-onchain.ts locally."
          : "";
      return c.json(
        {
          error: explained.reason + hint,
          code: explained.code,
          wallet: body.wallet,
        },
        400,
      );
    }

    // Cloudflare Worker IP can't reach the RPC → 503 with fallback hint.
    // Do NOT touch D1 — the on-chain state is unchanged.
    if (isRpcUnreachable(err)) {
      console.error("force-expire RPC unreachable:", msg);
      return c.json(
        {
          error: "RPC unavailable from Worker IP",
          hint: "Run scripts/expire-onchain.ts --wallet <pubkey> from your local machine",
          wallet: body.wallet,
        },
        503,
      );
    }

    console.error("force-expire submit failed:", msg);
    return c.json(
      {
        error: "on-chain submit failed",
        detail: msg.slice(0, 300),
        wallet: body.wallet,
      },
      500,
    );
  }

  // ── On-chain success → mirror into D1 + audit log ────────────────────────
  await c.env.DB.prepare(
    `UPDATE positions SET status = 'expired' WHERE network_id = ? AND wallet = ?`,
  )
    .bind(c.env.NETWORK_ID, body.wallet)
    .run();

  const nowS = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    "INSERT INTO oracle_audit (id, signed_at, caller, ix_kind, signature) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), nowS, "merchant/force-expire", "force_expire", sig)
    .run();

  const cluster = c.env.SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${c.env.SOLANA_CLUSTER}`;
  return c.json({
    wallet: body.wallet,
    status: "expired",
    tx_signature: sig,
    solscan_url: `https://solscan.io/tx/${sig}${cluster}`,
  });
});

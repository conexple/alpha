// scripts/settle-onchain.ts — local fallback for the on-chain settle path.
//
// Why this exists:
//   The Cloudflare Worker scheduler tries to submit add_earnings txs from
//   the Worker itself, but Solana's public devnet RPC blocks Cloudflare
//   Workers' IP range and the free-tier alternatives (rpcpool, etc.) do
//   the same. Without a paid Helius / Triton API key — out of scope for
//   the V1 prototype — the Worker can't reach devnet directly.
//   This script does the same work from the developer's IP, then posts the
//   resulting signature back to the worker via /settle/record so the D1
//   audit trail stays correct and the dashboard's settlement runs reflect
//   real on-chain transactions.
//
// Usage:
//   OPERATOR_URL=https://conexple-worker-operator.sornwin.workers.dev \
//   pnpm exec tsx scripts/settle-onchain.ts
//
// What it does:
//   1. GET /settle/pending — pull pending_commission rows where
//      settle_at <= now and status='pending'.
//   2. Group by purchase_id; for each purchase pull buyer+amount from the
//      embedded join, trace upline 1..5 hops on-chain, build one add_earnings
//      ix per active ancestor at amount=floor(margin/7).
//   3. Submit one tx per purchase, oracle-signed, await confirmation.
//   4. POST /settle/record back with {purchase_id, signature, recipients}.
//   5. Print a Solscan-friendly summary at the end.

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");
const OPERATOR_URL =
  process.env.OPERATOR_URL ??
  "https://conexple-worker-operator.sornwin.workers.dev";
const NETWORK_PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID_NETWORK ??
    "9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9",
);
const root = path.resolve(process.cwd());

const ADD_EARNINGS_DISCRIMINATOR = Buffer.from([
  33, 238, 51, 61, 134, 44, 42, 111,
]);

interface PendingRow {
  id: string;
  purchase_id: string;
  recipient: string;
  kind: string;
  slot: number;
  amount: number;
  anchor_at: number;
  settle_at: number;
  buyer: string;
  purchase_amount: number;
}

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}

function u64Le(n: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function networkPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(NETWORK_ID)],
    NETWORK_PROGRAM_ID,
  );
  return pda;
}

function positionPda(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(NETWORK_ID), wallet.toBuffer()],
    NETWORK_PROGRAM_ID,
  );
  return pda;
}

function buildAddEarningsIx(
  recipientWallet: PublicKey,
  oracleAuthority: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(8 + 8);
  ADD_EARNINGS_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  return new TransactionInstruction({
    programId: NETWORK_PROGRAM_ID,
    keys: [
      { pubkey: networkPda(), isSigner: false, isWritable: false },
      { pubkey: positionPda(recipientWallet), isSigner: false, isWritable: true },
      { pubkey: oracleAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

interface UplineHop {
  level: number;
  wallet: PublicKey;
  positionPda: PublicKey;
  status: "active" | "expired";
}

function decodePositionShallow(data: Buffer): {
  wallet: PublicKey;
  parent: PublicKey | null;
  status: "active" | "expired";
} {
  let cur = 8;
  cur += 1;
  cur += 8;
  const wallet = new PublicKey(data.subarray(cur, cur + 32));
  cur += 32;
  // Anchor `Option<Pubkey>` = 1 tag byte, then 32 bytes IF tag=1.
  const parentTag = data.readUInt8(cur);
  cur += 1;
  let parent: PublicKey | null = null;
  if (parentTag === 1) {
    parent = new PublicKey(data.subarray(cur, cur + 32));
    cur += 32;
  }
  cur += 1;
  const statusByte = data.readUInt8(cur);
  const status: "active" | "expired" = statusByte === 0 ? "active" : "expired";
  return { wallet, parent, status };
}

async function traceUpline(
  conn: Connection,
  buyer: PublicKey,
  maxLevels = 5,
): Promise<UplineHop[]> {
  const hops: UplineHop[] = [];
  const buyerInfo = await conn.getAccountInfo(positionPda(buyer));
  if (!buyerInfo) return hops;
  let { parent: nextParent } = decodePositionShallow(buyerInfo.data);
  for (let level = 1; level <= maxLevels; level++) {
    if (!nextParent) break;
    const pda = positionPda(nextParent);
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

interface SettleResult {
  purchase_id: string;
  buyer: string;
  amount: number;
  perSlot: number;
  signature?: string;
  recipients: Array<{ wallet: string; level: number; amount: number }>;
  status: "settled" | "skipped" | "failed";
  reason?: string;
}

async function main() {
  const oracle = loadKeypair(path.join(root, "keys", "oracle-devnet.json"));
  console.log("Oracle:", oracle.publicKey.toBase58());
  console.log("Network ID:", NETWORK_ID.toString());
  console.log("RPC:", RPC);
  console.log("Operator:", OPERATOR_URL);

  const conn = new Connection(RPC, "confirmed");

  // 1. Pull pending rows from worker.
  const r = await fetch(`${OPERATOR_URL}/settle/pending`);
  if (!r.ok) {
    throw new Error(`/settle/pending → ${r.status} ${await r.text()}`);
  }
  const { ready } = (await r.json()) as { now: number; ready: PendingRow[] };
  if (!ready || ready.length === 0) {
    console.log("\nNo pending rows ready. Nothing to settle.");
    return;
  }
  console.log(`\n${ready.length} pending rows across ${new Set(ready.map((x) => x.purchase_id)).size} purchases.\n`);

  // 2. Group by purchase_id.
  const byPurchase = new Map<string, PendingRow[]>();
  for (const row of ready) {
    const list = byPurchase.get(row.purchase_id) ?? [];
    list.push(row);
    byPurchase.set(row.purchase_id, list);
  }

  const results: SettleResult[] = [];

  for (const [purchaseId, group] of byPurchase) {
    const sample = group[0]!;
    const perSlot = Math.floor(Math.floor(sample.purchase_amount / 2) / 7);
    const result: SettleResult = {
      purchase_id: purchaseId,
      buyer: sample.buyer,
      amount: sample.purchase_amount,
      perSlot,
      recipients: [],
      status: "skipped",
    };

    if (perSlot <= 0) {
      result.reason = "purchase too small for any slot";
      results.push(result);
      console.log(`▷ ${purchaseId.slice(0, 8)}… → SKIP (amount ${sample.purchase_amount} too small)`);
      continue;
    }

    try {
      const buyerKey = new PublicKey(sample.buyer);
      const upline = await traceUpline(conn, buyerKey, 5);
      const ixs: TransactionInstruction[] = [];
      for (const hop of upline) {
        if (hop.status !== "active") continue;
        ixs.push(buildAddEarningsIx(hop.wallet, oracle.publicKey, BigInt(perSlot)));
        result.recipients.push({
          wallet: hop.wallet.toBase58(),
          level: hop.level,
          amount: perSlot,
        });
      }

      if (ixs.length === 0) {
        result.reason = "no active uplines";
        results.push(result);
        console.log(`▷ ${purchaseId.slice(0, 8)}… → SKIP (no active uplines)`);
        continue;
      }

      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
        .add(...ixs);

      console.log(`▷ ${purchaseId.slice(0, 8)}… buyer ${sample.buyer.slice(0, 8)}… → ${ixs.length} add_earnings × ${perSlot} bp`);
      const sig = await sendAndConfirmTransaction(conn, tx, [oracle], {
        commitment: "confirmed",
        skipPreflight: false,
      });
      result.signature = sig;
      result.status = "settled";
      console.log(`   ✅ ${sig}`);
      console.log(`   Solscan: https://solscan.io/tx/${sig}?cluster=devnet`);

      // 3. Tell the worker to record the result.
      const recordRes = await fetch(`${OPERATOR_URL}/settle/record`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purchase_id: purchaseId,
          signature: sig,
          recipients: result.recipients,
        }),
      });
      if (!recordRes.ok) {
        console.warn(
          `   ⚠️  /settle/record returned ${recordRes.status}: ${(await recordRes.text()).slice(0, 200)}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.status = "failed";
      result.reason = msg.slice(0, 300);
      console.error(`   ❌ ${msg.slice(0, 200)}`);
    }

    results.push(result);
  }

  // Summary
  const settled = results.filter((r) => r.status === "settled").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log("\n────────────────────────────");
  console.log(`Settled: ${settled}  Skipped: ${skipped}  Failed: ${failed}`);
  if (settled > 0) {
    console.log("\nSolscan links:");
    for (const r of results) {
      if (r.signature) {
        console.log(`  ${r.purchase_id.slice(0, 8)}…  https://solscan.io/tx/${r.signature}?cluster=devnet`);
      }
    }
  }

  // Optional: write a receipt for the submission/ folder
  const receiptPath = path.join(root, "submission", "settle-receipt.json");
  fs.writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        operator: OPERATOR_URL,
        rpc: RPC,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nReceipt → ${receiptPath}`);
}

main().catch((e) => {
  console.error("settle-onchain.ts failed:", e);
  process.exit(1);
});

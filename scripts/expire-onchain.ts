// scripts/expire-onchain.ts — local fallback for the on-chain expire path.
//
// Why this exists:
//   The Cloudflare Worker scheduler tries to submit `expire_position` txs
//   from the Worker itself, but Solana's public devnet RPC blocks Cloudflare
//   Workers' IP range and the free-tier alternatives do the same.
//   Without a paid Helius / Triton API key — out of scope for the V1
//   prototype — the Worker cannot reach devnet directly.
//
//   This script does the same work from the developer's IP, then posts the
//   resulting signature(s) back to the worker via /settle/record-expired so
//   the D1 audit trail stays correct and the dashboard's expire count
//   reflects real on-chain transactions.
//
// Usage:
//   OPERATOR_URL=https://conexple-worker-operator.sornwin.workers.dev \
//   PURCHASE_WEBHOOK_HMAC=<...> \
//   pnpm exec tsx scripts/expire-onchain.ts
//
//   Optional:
//     SOLANA_RPC_URL=...    (default api.devnet.solana.com)
//     NETWORK_ID=1          (default 1)
//     ORACLE_KEY=...        path to keypair JSON (default keys/oracle-devnet.json)
//     DRY_RUN=true          read + select only; skip txs and post-back
//     GRACE=1               cycle grace (default 1 → expire after > 2 cycles inactive)
//
// What it does:
//   1. getProgramAccounts (Position size = 190) on the network program.
//   2. Read NetworkState.cycle_index.
//   3. selectExpirable: status=Active AND cycle_index - last_purchase_round > grace+1
//      (matches the on-chain ExpiryNotEligible guard).
//   4. Build one `expire_position` ix per candidate; batch ~8 per tx.
//   5. Submit each tx (oracle pays fees; expire_position is permissionless).
//   6. POST /settle/record-expired with the wallets + signatures so D1
//      updates positions.status = 'expired'.
//   7. Print Solscan links per tx and write submission/expire-receipt.json.

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");
const OPERATOR_URL =
  process.env.OPERATOR_URL ??
  "https://conexple-worker-operator.sornwin.workers.dev";
const NETWORK_PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID_NETWORK ??
    "9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9",
);
const ORACLE_KEY_PATH =
  process.env.ORACLE_KEY ?? path.join(process.cwd(), "keys", "oracle-devnet.json");
const DRY_RUN = (process.env.DRY_RUN ?? "false").toLowerCase() === "true";
const GRACE = BigInt(process.env.GRACE ?? "1");
const BATCH_SIZE = 8;
const POSITION_ACCOUNT_SIZE = 190;
const root = path.resolve(process.cwd());

// Anchor instruction discriminator for `expire_position`, taken verbatim
// from packages/sdk/src/idl/conexple_network.json.
const EXPIRE_POSITION_DISCRIMINATOR = Buffer.from([
  146, 203, 82, 231, 253, 127, 123, 214,
]);

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

// ── Position decoding (mirror of apps/operator/src/chain/expire.ts) ──────

interface PositionFull {
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

function decodePositionFull(pubkey: PublicKey, data: Buffer): PositionFull {
  let cur = 8; // discriminator
  cur += 1; // bump
  cur += 8; // network_id
  const wallet = new PublicKey(data.subarray(cur, cur + 32));
  cur += 32;
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

async function readCurrentCycleIndex(conn: Connection): Promise<bigint> {
  const info = await conn.getAccountInfo(networkPda());
  if (!info) {
    throw new Error(`NetworkState not found at ${networkPda().toBase58()}`);
  }
  // Offsets: 8 disc + 1 bump + 8 network_id + 32 admin + 32 oracle + 8 cycle_seconds
  return info.data.readBigUInt64LE(8 + 1 + 8 + 32 + 32 + 8);
}

interface ExpireCandidate {
  position: PositionFull;
  reason: "inactivity" | "cap";
  cycles_inactive: bigint;
}

function selectExpirable(
  positions: PositionFull[],
  currentRound: bigint,
  grace: bigint,
): ExpireCandidate[] {
  const out: ExpireCandidate[] = [];
  for (const p of positions) {
    if (p.status !== "active") continue;
    const elapsed = currentRound > p.last_purchase_round
      ? currentRound - p.last_purchase_round
      : 0n;
    if (elapsed > grace + 1n) {
      out.push({ position: p, reason: "inactivity", cycles_inactive: elapsed });
      continue;
    }
    if (p.earnings_cap > 0n && p.cumulative_earned >= p.earnings_cap) {
      out.push({ position: p, reason: "cap", cycles_inactive: elapsed });
    }
  }
  return out;
}

function buildExpireIx(positionWallet: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: NETWORK_PROGRAM_ID,
    keys: [
      { pubkey: networkPda(), isSigner: false, isWritable: false },
      { pubkey: positionPda(positionWallet), isSigner: false, isWritable: true },
    ],
    data: Buffer.from(EXPIRE_POSITION_DISCRIMINATOR),
  });
}

interface BatchResult {
  signature?: string;
  wallets: string[];
  reasons: Array<{ wallet: string; reason: string; cycles_inactive: string }>;
  status: "submitted" | "failed" | "skipped";
  error?: string;
}

async function main() {
  console.log("Conexple expire-onchain — local fallback");
  console.log("Network ID:", NETWORK_ID.toString());
  console.log("RPC:", RPC);
  console.log("Operator:", OPERATOR_URL);
  console.log("Grace:", GRACE.toString());
  console.log("Dry-run:", DRY_RUN);

  const conn = new Connection(RPC, "confirmed");

  // 1. Load all Positions.
  console.log("\n[1/4] getProgramAccounts (Position, size 190)…");
  const accounts = await conn.getProgramAccounts(NETWORK_PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: POSITION_ACCOUNT_SIZE }],
  });
  console.log(`      ${accounts.length} accounts`);

  // 2. Read cycle.
  const currentRound = await readCurrentCycleIndex(conn);
  console.log(`[2/4] current cycle_index = ${currentRound.toString()}`);

  // 3. Decode + select.
  const decoded: PositionFull[] = [];
  for (const { pubkey, account } of accounts) {
    try {
      decoded.push(decodePositionFull(pubkey, Buffer.from(account.data)));
    } catch (e) {
      console.warn(`      decode failed for ${pubkey.toBase58()}:`, e);
    }
  }
  const candidates = selectExpirable(decoded, currentRound, GRACE);
  const inactivity = candidates.filter((c) => c.reason === "inactivity");
  const cap = candidates.filter((c) => c.reason === "cap");
  console.log(
    `[3/4] candidates: ${candidates.length} (inactivity=${inactivity.length}, cap=${cap.length})`,
  );

  if (cap.length > 0) {
    console.log("\nNote: cap-only candidates need force_expire (admin signer):");
    for (const c of cap) {
      console.log(
        `  ${c.position.wallet.toBase58()}  earned=${c.position.cumulative_earned} cap=${c.position.earnings_cap}`,
      );
    }
  }

  if (inactivity.length === 0) {
    console.log("\nNothing to expire via permissionless ix. Done.");
    return;
  }

  // 4. Build, sign, submit batches.
  console.log("\n[4/4] building + submitting expire batches…");
  if (DRY_RUN) {
    console.log("DRY_RUN=true — skipping tx submission. Would expire:");
    for (const c of inactivity) {
      console.log(
        `  ${c.position.wallet.toBase58()}  cycles_inactive=${c.cycles_inactive}`,
      );
    }
    return;
  }

  const oracle = loadKeypair(ORACLE_KEY_PATH);
  console.log("Fee payer (oracle):", oracle.publicKey.toBase58());

  const batches: ExpireCandidate[][] = [];
  for (let i = 0; i < inactivity.length; i += BATCH_SIZE) {
    batches.push(inactivity.slice(i, i + BATCH_SIZE));
  }

  const results: BatchResult[] = [];
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!;
    const result: BatchResult = {
      wallets: batch.map((c) => c.position.wallet.toBase58()),
      reasons: batch.map((c) => ({
        wallet: c.position.wallet.toBase58(),
        reason: c.reason,
        cycles_inactive: c.cycles_inactive.toString(),
      })),
      status: "skipped",
    };
    try {
      const ixs = batch.map((c) => buildExpireIx(c.position.wallet));
      const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
        .add(...ixs);
      console.log(
        `\n  ▷ batch ${bi + 1}/${batches.length}: ${batch.length} positions`,
      );
      for (const c of batch) {
        console.log(
          `     ${c.position.wallet.toBase58()}  cycles_inactive=${c.cycles_inactive}`,
        );
      }
      const sig = await sendAndConfirmTransaction(conn, tx, [oracle], {
        commitment: "confirmed",
        skipPreflight: false,
      });
      result.signature = sig;
      result.status = "submitted";
      console.log(`     ✅ ${sig}`);
      console.log(`     Solscan: https://solscan.io/tx/${sig}?cluster=devnet`);

      // Post-back to operator so D1 reflects the expirations.
      const body = JSON.stringify({
        signature: sig,
        wallets: result.wallets,
        cycles_inactive: Object.fromEntries(
          batch.map((c) => [c.position.wallet.toBase58(), Number(c.cycles_inactive)]),
        ),
      });
      const HMAC = process.env.PURCHASE_WEBHOOK_HMAC ?? "";
      if (!HMAC) {
        console.warn(
          "     ⚠️  PURCHASE_WEBHOOK_HMAC not set — /settle/record-expired will 401",
        );
      }
      const recordSig = HMAC
        ? crypto.createHmac("sha256", HMAC).update(body).digest("hex")
        : "";
      const rec = await fetch(`${OPERATOR_URL}/settle/record-expired`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-conexple-internal": recordSig,
        },
        body,
      });
      if (!rec.ok) {
        console.warn(
          `     ⚠️  /settle/record-expired returned ${rec.status}: ${(await rec.text()).slice(0, 200)}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.status = "failed";
      result.error = msg.slice(0, 300);
      console.error(`     ❌ ${msg.slice(0, 200)}`);
    }
    results.push(result);
  }

  const submitted = results.filter((r) => r.status === "submitted").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const expiredTotal = results
    .filter((r) => r.status === "submitted")
    .reduce((acc, r) => acc + r.wallets.length, 0);

  console.log("\n────────────────────────────");
  console.log(
    `Batches: ${submitted} submitted, ${failed} failed.  Positions expired: ${expiredTotal}`,
  );
  if (submitted > 0) {
    console.log("\nSolscan links:");
    for (const r of results) {
      if (r.signature) {
        console.log(
          `  https://solscan.io/tx/${r.signature}?cluster=devnet  (${r.wallets.length} positions)`,
        );
      }
    }
  }

  // Receipt
  const receiptDir = path.join(root, "submission");
  if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, "expire-receipt.json");
  fs.writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        operator: OPERATOR_URL,
        rpc: RPC,
        network_id: NETWORK_ID.toString(),
        current_cycle: currentRound.toString(),
        grace: GRACE.toString(),
        candidates_seen: candidates.length,
        inactivity_candidates: inactivity.length,
        cap_candidates: cap.length,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nReceipt → ${receiptPath}`);
}

main().catch((e) => {
  console.error("expire-onchain.ts failed:", e);
  process.exit(1);
});

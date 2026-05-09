// scripts/demo-purchases.ts — push 3 fake purchase webhook events to the
// deployed operator URL so the operator dashboard isn't empty on first load.
//
// Use after operator + frontend are deployed. Reads:
//   OPERATOR_URL              from env
//   PURCHASE_WEBHOOK_HMAC     same secret as `wrangler secret put`
//
// V1: hits /webhook/purchase 3 times, one for each demo wallet C / D / E.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const OPERATOR_URL =
  process.env.OPERATOR_URL ?? "https://conexple-worker-operator.workers.dev";
const HMAC = process.env.PURCHASE_WEBHOOK_HMAC ?? "";
const NETWORK_ID = process.env.NETWORK_ID ?? "1";
const root = path.resolve(import.meta.dirname, "..");

if (!HMAC) {
  console.error("Set PURCHASE_WEBHOOK_HMAC in env (the same value used for wrangler secret put)");
  process.exit(1);
}

function loadKp(p: string): { publicKey: string } {
  const file = path.join(root, "keys", p);
  if (!fs.existsSync(file)) {
    console.warn(`missing ${file} — run pnpm seed first`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
  // Re-derive public key from secretKey: secretKey is the last 32 bytes? No,
  // it's actually 64 bytes where bytes 32..64 = public key.
  const sk = Uint8Array.from(raw);
  const pubBytes = sk.slice(32, 64);
  // Convert to base58
  // Inline minimal base58 encoder to avoid pulling in dep here
  return { publicKey: bs58Encode(pubBytes) };
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(buf: Uint8Array): string {
  let zeros = 0;
  for (const b of buf) {
    if (b === 0) zeros++;
    else break;
  }
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n = n / 58n;
  }
  return "1".repeat(zeros) + out;
}

async function pushOne(wallet: string, amount: number) {
  const correlation_id = crypto.randomUUID();
  const body = JSON.stringify({
    network_id: NETWORK_ID,
    merchant_id: 1,
    buyer: wallet,
    amount,
    block_time: Math.floor(Date.now() / 1000),
    correlation_id,
  });
  const sig = crypto.createHmac("sha256", HMAC).update(body).digest("hex");
  const r = await fetch(`${OPERATOR_URL}/webhook/purchase`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-conexple-sig": sig },
    body,
  });
  console.log(
    `→ ${wallet.slice(0, 8)}… ${amount} bp ⇒ ${r.status} ${(await r.text()).slice(0, 100)}`,
  );
}

async function main() {
  const C = loadKp("demo-C.json");
  const D = loadKp("demo-D.json");
  const E = loadKp("demo-E.json");

  await pushOne(E.publicKey, 1000);
  await pushOne(D.publicKey, 500);
  await pushOne(C.publicKey, 2000);

  console.log("\nDone. Visit the operator dashboard:");
  console.log(`  ${OPERATOR_URL}/settle/status`);
}

main().catch((e) => {
  console.error("demo-purchases.ts failed:", e);
  process.exit(1);
});

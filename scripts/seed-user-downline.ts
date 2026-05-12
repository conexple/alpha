// Seed a downline under the user's connected wallet so a settled purchase
// actually pays commission to the user's wallet.
//
//   user_wallet (registered via Phantom)
//   └── demo-X  (NEW: registered here + placed by oracle + sends purchase)
//
// After settlement, the commission split lands on user_wallet (level 1),
// the user_wallet's parent (level 2), etc. — proving the flow end-to-end.

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");
const USER_WALLET = new PublicKey(
  process.env.USER_WALLET ?? "FABRyGWFkWLVCPUnTsX21DsU1jDQFuhgpEHHvtCJ7xCM",
);
const OPERATOR_URL =
  process.env.OPERATOR_URL ?? "https://conexple-worker-operator.sornwin.workers.dev";
const root = path.resolve(process.cwd());

function loadKp(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}

function loadIdl(name: string): Idl {
  return JSON.parse(
    fs.readFileSync(path.join(root, "target", "idl", `${name}.json`), "utf8"),
  ) as Idl;
}

function deterministicWallet(label: string): Keypair {
  const seed = Buffer.alloc(32, 0);
  Buffer.from(`conexple-demo-${label}`).copy(seed);
  return Keypair.fromSeed(seed.subarray(0, 32));
}

function u64Le(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const deployer = loadKp(path.join(root, "keys", "devnet-deployer.json"));
  const oracle = loadKp(path.join(root, "keys", "oracle-devnet.json"));

  const wallet = new anchor.Wallet(deployer);
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const network = new Program(loadIdl("conexple_network"), provider);
  const networkProgramId = network.programId;

  const [networkPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(NETWORK_ID)],
    networkProgramId,
  );

  // ── demo-X wallet ────────────────────────────────────────────────────
  const xKp = deterministicWallet("X");
  console.log(`demo-X wallet: ${xKp.publicKey.toBase58()}`);
  const xKeyPath = path.join(root, "keys", "demo-X.json");
  if (!fs.existsSync(xKeyPath)) {
    fs.writeFileSync(xKeyPath, JSON.stringify(Array.from(xKp.secretKey)));
  }

  // ── Fund demo-X ───────────────────────────────────────────────────────
  const xBal = await conn.getBalance(xKp.publicKey);
  if (xBal < 0.02 * LAMPORTS_PER_SOL) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: xKp.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      }),
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [deployer], { commitment: "confirmed" });
    console.log(`funded demo-X 0.05 SOL: ${sig.slice(0, 12)}…`);
  } else {
    console.log(`demo-X has ${(xBal / LAMPORTS_PER_SOL).toFixed(4)} SOL (skip funding)`);
  }

  // ── Register demo-X ──────────────────────────────────────────────────
  const [xPos] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(NETWORK_ID), xKp.publicKey.toBuffer()],
    networkProgramId,
  );
  const xPosInfo = await conn.getAccountInfo(xPos);
  if (!xPosInfo) {
    const sig = await (network.methods as any)
      .registerMember(new anchor.BN(1_000), 10)
      .accounts({
        network: networkPda,
        position: xPos,
        wallet: xKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([xKp])
      .rpc();
    console.log(`register demo-X: ${sig.slice(0, 12)}…`);
  } else {
    console.log(`demo-X already registered`);
  }

  // ── Place demo-X under user_wallet ───────────────────────────────────
  const [userPos] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(NETWORK_ID), USER_WALLET.toBuffer()],
    networkProgramId,
  );
  try {
    const sig = await (network.methods as any)
      .placeMember()
      .accounts({
        network: networkPda,
        position: xPos,
        parentPosition: userPos,
        oracleAuthority: oracle.publicKey,
      })
      .signers([oracle])
      .rpc();
    console.log(`place demo-X under user_wallet: ${sig.slice(0, 12)}…`);
  } catch (e) {
    const msg = String(e);
    if (msg.includes("AlreadyPlaced")) {
      console.log(`demo-X already placed`);
    } else {
      console.warn(`place demo-X failed: ${msg.slice(0, 300)}`);
    }
  }

  // ── Send purchase webhook from demo-X ────────────────────────────────
  const hmacFile = path.join(root, "keys", "webhook-hmac.txt");
  const hmacKey = fs.readFileSync(hmacFile, "utf8").trim();
  const block_time = Math.floor(Date.now() / 1000) - 60 * 86400; // 60 days backdated
  const correlation_id = crypto.randomUUID();
  const amount = Number(process.env.SEED_AMOUNT ?? "5000");
  const body = JSON.stringify({
    network_id: NETWORK_ID.toString(),
    merchant_id: 1,
    buyer: xKp.publicKey.toBase58(),
    amount,
    block_time,
    correlation_id,
  });
  const sig = crypto.createHmac("sha256", hmacKey).update(body).digest("hex");
  const r = await fetch(`${OPERATOR_URL}/webhook/purchase`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-conexple-sig": sig },
    body,
  });
  const text = await r.text();
  console.log(`purchase webhook → ${r.status}: ${text}`);

  console.log("\n────────────────────────────");
  console.log(`demo-X:       ${xKp.publicKey.toBase58()}`);
  console.log(`user wallet:  ${USER_WALLET.toBase58()}`);
  console.log(`amount:       5000 base units`);
  console.log(`correlation:  ${correlation_id}`);
  console.log("\nNext: run scripts/settle-onchain.ts — commission flows to user_wallet.");
}

main().catch((e) => {
  console.error("seed-user-downline.ts failed:", e);
  process.exit(1);
});

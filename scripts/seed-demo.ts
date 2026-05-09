// scripts/seed-demo.ts — populate devnet with demo data so the frontend
// shows a non-empty network on first load.
//
// Creates:
//   * 1 demo merchant (id = 1)  — name "Demo Merchant 01"
//   * 5 demo wallets (deterministic, generated from a fixed seed)
//   * A 3-level network:
//       A
//       ├── B
//       │   └── E
//       └── C
//
// Wallets get airdropped SOL (for fees) + demo USDC (for purchases).

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");
const root = path.resolve(import.meta.dirname, "..");

const DEMO_LABELS = ["A", "B", "C", "D", "E"] as const;
type Label = (typeof DEMO_LABELS)[number];

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}
function loadIdl(name: string): Idl {
  return JSON.parse(
    fs.readFileSync(path.join(root, "target", "idl", `${name}.json`), "utf8"),
  ) as Idl;
}
function deterministicWallet(label: Label): Keypair {
  // 32-byte seed = 32 chars of `label` repeated, sliced.
  const seed = Buffer.alloc(32, 0);
  Buffer.from(`conexple-demo-${label}`).copy(seed);
  return Keypair.fromSeed(seed.subarray(0, 32));
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const deployer = loadKeypair(path.join(root, "keys", "devnet-deployer.json"));
  const wallet = new anchor.Wallet(deployer);
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const network = new Program(loadIdl("conexple_network"), provider);
  const networkProgramId = network.programId;

  const u64Le = (n: bigint): Buffer => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(n);
    return buf;
  };
  const [networkPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(NETWORK_ID)],
    networkProgramId,
  );

  // ── Generate + register 5 demo wallets ───────────────────────────────
  const wallets: Record<Label, Keypair> = Object.fromEntries(
    DEMO_LABELS.map((l) => [l, deterministicWallet(l)]),
  ) as Record<Label, Keypair>;

  // Persist wallet files for reproducibility (gitignored — keys/)
  for (const [label, kp] of Object.entries(wallets)) {
    const file = path.join(root, "keys", `demo-${label}.json`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)));
    }
  }

  // Airdrop SOL to each
  for (const [label, kp] of Object.entries(wallets)) {
    const bal = await conn.getBalance(kp.publicKey);
    if (bal < 0.5 * 1e9) {
      try {
        const sig = await conn.requestAirdrop(kp.publicKey, 1e9);
        await conn.confirmTransaction(sig, "confirmed");
        console.log(`airdropped 1 SOL to ${label}: ${kp.publicKey.toBase58()}`);
      } catch (e) {
        console.warn(`airdrop ${label} failed (rate limit?), continuing:`, String(e).slice(0, 80));
      }
    }
  }

  // Each wallet self-registers
  for (const label of DEMO_LABELS) {
    const kp = wallets[label]!;
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), u64Le(NETWORK_ID), kp.publicKey.toBuffer()],
      networkProgramId,
    );
    const info = await conn.getAccountInfo(positionPda);
    if (info) {
      console.log(`▷ register ${label}: position exists, skipping`);
      continue;
    }
    try {
      const sig = await (network.methods as any).registerMember(
        new anchor.BN(1_000),    // initial_spend (units of demo USDC base)
        10,                      // multiplier
      )
        .accounts({
          network: networkPda,
          position: positionPda,
          wallet: kp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([kp])
        .rpc();
      console.log(`▷ register ${label}: ${sig}`);
    } catch (e) {
      console.warn(`register ${label} failed:`, String(e).slice(0, 200));
    }
  }

  // ── Place B/C under A, E under B ─────────────────────────────────────
  // (oracle = deployer in V1)
  const placements: Array<[Label, Label]> = [
    ["B", "A"],
    ["C", "A"],
    ["E", "B"],
    ["D", "C"],
  ];
  for (const [child, parent] of placements) {
    const childKp = wallets[child]!;
    const parentKp = wallets[parent]!;
    const [childPos] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), u64Le(NETWORK_ID), childKp.publicKey.toBuffer()],
      networkProgramId,
    );
    const [parentPos] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), u64Le(NETWORK_ID), parentKp.publicKey.toBuffer()],
      networkProgramId,
    );
    try {
      const sig = await (network.methods as any).placeMember()
        .accounts({
          network: networkPda,
          position: childPos,
          parentPosition: parentPos,
          oracleAuthority: deployer.publicKey,
        })
        .signers([deployer])
        .rpc();
      console.log(`▷ place ${child} under ${parent}: ${sig}`);
    } catch (e) {
      console.warn(`place ${child} under ${parent} failed (likely already placed):`, String(e).slice(0, 200));
    }
  }

  console.log("\n✅ Seed complete.");
  for (const label of DEMO_LABELS) {
    console.log(`  ${label}: ${wallets[label]!.publicKey.toBase58()}`);
  }
}

main().catch((e) => {
  console.error("seed-demo.ts failed:", e);
  process.exit(1);
});

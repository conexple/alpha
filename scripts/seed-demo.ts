// scripts/seed-demo.ts — populate devnet with a rich demo network.
//
// Tree (5 levels deep, 5 lv1 branches, 16 wallets):
//
//   A (lv0, root)
//   ├── B  (lv1)
//   │   └── E  (lv2, existing)
//   │       └── M  (lv3, NEW)
//   │           └── N  (lv4, NEW)
//   │               └── O  (lv5, NEW) ← max-depth path #1: A→B→E→M→N→O
//   ├── C  (lv1, existing)
//   │   └── D  (lv2, existing — depth-2 leaf)
//   ├── F  (lv1, NEW)
//   │   └── I  (lv2, NEW)
//   │       └── J  (lv3, NEW)
//   │           └── K  (lv4, NEW)
//   │               └── L  (lv5, NEW) ← max-depth path #2: A→F→I→J→K→L
//   ├── G  (lv1, NEW)
//   │   └── P  (lv2, NEW)              ← shorter sibling for variety
//   └── H  (lv1, NEW — leaf)
//
// Wallets fund themselves with 0.05 SOL from deployer (devnet airdrop is
// rate-limited per-IP). Existing positions are skipped on re-run.

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
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");
const root = path.resolve(process.cwd());

// Wallets. Order matters — register in this order, then place per
// `PLACEMENTS` below. New wallets are appended at the end so existing
// devnet positions (A..P) are preserved on re-run.
//
// Three distinct trees in one network:
//   A's tree — original, 16 wallets, 5 levels deep
//   Q's tree — separate root, 4 wallets, 3 levels
//   R       — standalone root with no children (yet)
const DEMO_LABELS = [
  "A", "B", "C", "D", "E",                     // existing A-tree (3-level)
  "F", "G", "H",                                // A's lv1
  "I",                                           // F → I (lv2)
  "J", "K", "L",                                // F → I → J → K → L (chain to lv5)
  "M", "N", "O",                                // B → E → M → N → O (chain to lv5)
  "P",                                           // G → P (lv2)
  "Q",                                           // 2nd ROOT — independent tree
  "Y",                                           // Q → Y (Q-tree lv1)
  "Z",                                           // Y → Z (Q-tree lv2)
  "W",                                           // Z → W (Q-tree lv3)
  "R",                                           // 3rd ROOT — standalone, no children
] as const;
type Label = (typeof DEMO_LABELS)[number];

// child → parent. Q, R have no entry → remain as roots.
const PLACEMENTS: Array<[Label, Label]> = [
  // A's tree (existing)
  ["B", "A"], ["C", "A"], ["E", "B"], ["D", "C"],
  ["F", "A"], ["G", "A"], ["H", "A"],
  ["I", "F"], ["J", "I"], ["K", "J"], ["L", "K"],
  ["M", "E"], ["N", "M"], ["O", "N"],
  ["P", "G"],
  // Q's tree (new)
  ["Y", "Q"],
  ["Z", "Y"],
  ["W", "Z"],
];

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
  // 32-byte seed = "conexple-demo-<label>" padded with zeros.
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

  const oraclePath = path.join(root, "keys", "oracle-devnet.json");
  const oracle: Keypair = fs.existsSync(oraclePath)
    ? loadKeypair(oraclePath)
    : deployer;
  console.log(`oracle: ${oracle.publicKey.toBase58()}`);

  const u64Le = (n: bigint): Buffer => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(n);
    return buf;
  };
  const [networkPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(NETWORK_ID)],
    networkProgramId,
  );

  // ── Generate keypairs ────────────────────────────────────────────────
  const wallets: Record<Label, Keypair> = Object.fromEntries(
    DEMO_LABELS.map((l) => [l, deterministicWallet(l)]),
  ) as Record<Label, Keypair>;

  // Persist wallet files (gitignored — keys/)
  for (const [label, kp] of Object.entries(wallets)) {
    const file = path.join(root, "keys", `demo-${label}.json`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)));
    }
  }

  // Fund oracle once (pays placement tx fees)
  const oracleBal = await conn.getBalance(oracle.publicKey);
  if (oracleBal < 0.01 * LAMPORTS_PER_SOL) {
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: oracle.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      }),
    );
    await sendAndConfirmTransaction(conn, fundTx, [deployer], { commitment: "confirmed" });
    console.log(`funded oracle 0.1 SOL`);
  }

  // ── Fund each wallet with 0.05 SOL ──────────────────────────────────
  for (const [label, kp] of Object.entries(wallets)) {
    const bal = await conn.getBalance(kp.publicKey);
    if (bal < 0.02 * LAMPORTS_PER_SOL) {
      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: deployer.publicKey,
            toPubkey: kp.publicKey,
            lamports: 0.05 * LAMPORTS_PER_SOL,
          }),
        );
        const sig = await sendAndConfirmTransaction(conn, tx, [deployer], { commitment: "confirmed" });
        console.log(`funded ${label} 0.05 SOL: ${kp.publicKey.toBase58().slice(0, 8)}… (${sig.slice(0, 8)}…)`);
      } catch (e) {
        console.warn(`fund ${label} failed:`, String(e).slice(0, 200));
      }
    } else {
      console.log(`${label} has ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL (skip funding)`);
    }
  }

  // ── Self-register ───────────────────────────────────────────────────
  for (const label of DEMO_LABELS) {
    const kp = wallets[label]!;
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), u64Le(NETWORK_ID), kp.publicKey.toBuffer()],
      networkProgramId,
    );
    const info = await conn.getAccountInfo(positionPda);
    if (info) {
      console.log(`▷ register ${label}: exists, skipping`);
      continue;
    }
    try {
      const sig = await (network.methods as any)
        .registerMember(new anchor.BN(1_000), 10)
        .accounts({
          network: networkPda,
          position: positionPda,
          wallet: kp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([kp])
        .rpc();
      console.log(`▷ register ${label}: ${sig.slice(0, 12)}…`);
    } catch (e) {
      console.warn(`register ${label} failed:`, String(e).slice(0, 200));
    }
  }

  // ── Place ───────────────────────────────────────────────────────────
  for (const [child, parent] of PLACEMENTS) {
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
      const sig = await (network.methods as any)
        .placeMember()
        .accounts({
          network: networkPda,
          position: childPos,
          parentPosition: parentPos,
          oracleAuthority: oracle.publicKey,
        })
        .signers([oracle])
        .rpc();
      console.log(`▷ place ${child} → ${parent}: ${sig.slice(0, 12)}…`);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("AlreadyPlaced")) {
        console.log(`▷ place ${child} → ${parent}: already placed (skip)`);
      } else {
        console.warn(`place ${child} → ${parent} failed:`, msg.slice(0, 200));
      }
    }
  }

  console.log("\n✅ Seed complete. Wallets:");
  for (const label of DEMO_LABELS) {
    console.log(`  ${label.padEnd(2)}  ${wallets[label]!.publicKey.toBase58()}`);
  }
}

main().catch((e) => {
  console.error("seed-demo.ts failed:", e);
  process.exit(1);
});

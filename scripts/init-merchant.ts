// scripts/init-merchant.ts — initialize an additional MerchantEscrow on devnet
// and seed it with USDC. Idempotent on re-run.
//
// Why: the demo needs to prove the protocol is multi-merchant, not just one
// hardcoded "Demo Merchant 01". This script takes a numeric MERCHANT_ID and:
//
//   1. Derives the merchant_escrow PDA + its ATA-style vault.
//   2. If the PDA already exists, exits with "already initialized".
//   3. Otherwise creates the vault token account (deployer pays rent, owner =
//      merchant_escrow PDA), then calls conexple_escrow::initialize_merchant
//      signed by the deployer (deployer = merchant authority for the demo).
//   4. Deposits INITIAL_USDC_DEPOSIT base units from deployer's USDC ATA into
//      the vault.
//
// On-chain state stored in MerchantEscrow:
//   { network_id, merchant_id, merchant (= deployer.pk), vault, totals... }
//
// The MerchantEscrow account has NO `name` or `margin_bps` field — those are
// network-level (margin_bps_max in ProtocolConfig) or off-chain demo metadata.
// We log/print the values for traceability but do not write them on-chain.
//
// Usage (from the alpha root):
//   MERCHANT_ID=2 MERCHANT_NAME="Demo Merchant 02" MARGIN_BPS=4500 \
//     INITIAL_USDC_DEPOSIT=50000000 pnpm exec tsx scripts/init-merchant.ts

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");

// CLI inputs
const MERCHANT_ID = BigInt(process.env.MERCHANT_ID ?? "2");
const MERCHANT_NAME =
  process.env.MERCHANT_NAME ?? `Demo Merchant ${MERCHANT_ID.toString().padStart(2, "0")}`;
const MARGIN_BPS = Number(process.env.MARGIN_BPS ?? "5000"); // ≤5000 per protocol cap
const INITIAL_USDC_DEPOSIT = BigInt(process.env.INITIAL_USDC_DEPOSIT ?? "0"); // base units (USDC has 6 decimals)

const root = path.resolve(process.cwd());

function loadKeypair(p: string): Keypair {
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function loadIdl(name: string): Idl {
  const idlPath = path.join(root, "target", "idl", `${name}.json`);
  return JSON.parse(fs.readFileSync(idlPath, "utf8")) as Idl;
}

function programKeypair(name: string): Keypair {
  const p = path.join(root, "target", "deploy", `${name}-keypair.json`);
  return loadKeypair(p);
}

function u64Le(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

async function main() {
  // ── Validate inputs ─────────────────────────────────────────────────────
  if (MARGIN_BPS > 5000) {
    console.error(
      `MARGIN_BPS=${MARGIN_BPS} exceeds the protocol cap of 5000 (50%).`,
    );
    process.exit(1);
  }
  if (MARGIN_BPS < 0 || !Number.isInteger(MARGIN_BPS)) {
    console.error(`MARGIN_BPS must be a non-negative integer; got ${MARGIN_BPS}.`);
    process.exit(1);
  }
  if (MERCHANT_ID <= 0n) {
    console.error(`MERCHANT_ID must be > 0; got ${MERCHANT_ID}.`);
    process.exit(1);
  }

  const conn = new Connection(RPC, "confirmed");
  const deployer = loadKeypair(path.join(root, "keys", "devnet-deployer.json"));
  const wallet = new anchor.Wallet(deployer);
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const escrowKp = programKeypair("conexple_escrow");
  const escrow = new Program(loadIdl("conexple_escrow"), provider);

  // ── Resolve mint ────────────────────────────────────────────────────────
  const mintKp = loadKeypair(path.join(root, "keys", "demo-usdc-mint.json"));
  const mint = mintKp.publicKey;

  // ── PDA derivations ─────────────────────────────────────────────────────
  const [merchantEscrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), u64Le(NETWORK_ID), u64Le(MERCHANT_ID)],
    escrowKp.publicKey,
  );

  // The vault is an ATA where merchant_escrow PDA is the owner. PDAs are
  // off-curve, so allowOwnerOffCurve=true is required.
  const vault = getAssociatedTokenAddressSync(
    mint,
    merchantEscrowPda,
    /* allowOwnerOffCurve */ true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Deployer's USDC ATA — funding source for the deposit.
  const deployerAta = getAssociatedTokenAddressSync(
    mint,
    deployer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  console.log("──────────────────────────────────────────────────────────");
  console.log(`Initializing merchant: ${MERCHANT_NAME}`);
  console.log(`  network_id          : ${NETWORK_ID}`);
  console.log(`  merchant_id         : ${MERCHANT_ID}`);
  console.log(`  margin_bps (offch.) : ${MARGIN_BPS}`);
  console.log(`  initial deposit     : ${INITIAL_USDC_DEPOSIT} base units`);
  console.log(`  deployer (= merch.) : ${deployer.publicKey.toBase58()}`);
  console.log(`  USDC mint           : ${mint.toBase58()}`);
  console.log(`  MerchantEscrow PDA  : ${merchantEscrowPda.toBase58()}`);
  console.log(`  Vault (ATA)         : ${vault.toBase58()}`);
  console.log("──────────────────────────────────────────────────────────");

  // ── 1. Idempotency check ────────────────────────────────────────────────
  const existing = await conn.getAccountInfo(merchantEscrowPda);
  if (existing) {
    console.log(`▷ MerchantEscrow PDA already initialized — skipping init.`);
    // Still attempt deposit if requested and balance is currently zero.
    if (INITIAL_USDC_DEPOSIT > 0n) {
      const vaultInfo = await conn.getAccountInfo(vault);
      if (!vaultInfo) {
        console.warn("  ! vault account missing despite escrow init — bailing");
      } else {
        // Skip top-up to keep idempotency simple. Operators can run a
        // dedicated deposit script if they want to add more funds later.
        console.log(
          `  vault exists; skipping deposit on re-run (use a dedicated deposit script to top up).`,
        );
      }
    }
    printSolscan(merchantEscrowPda, vault);
    return;
  }

  // ── 2. Create vault ATA + initialize_merchant in one tx ─────────────────
  // Deployer is both the rent payer for the vault ATA and the merchant
  // signer for initialize_merchant.
  const createVaultIx = createAssociatedTokenAccountIdempotentInstruction(
    deployer.publicKey,           // payer
    vault,                        // ata to create
    merchantEscrowPda,            // owner (PDA)
    mint,                         // mint
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const initMerchantIx = await (escrow.methods as any)
    .initializeMerchant(
      new anchor.BN(NETWORK_ID.toString()),
      new anchor.BN(MERCHANT_ID.toString()),
    )
    .accounts({
      merchantEscrow: merchantEscrowPda,
      vault,
      merchant: deployer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new anchor.web3.Transaction().add(createVaultIx, initMerchantIx);
  const sig = await provider.sendAndConfirm(tx, [deployer], {
    commitment: "confirmed",
  });
  console.log(`▷ initialize_merchant tx: ${sig}`);
  console.log(`  https://solscan.io/tx/${sig}?cluster=devnet`);

  // ── 3. Deposit USDC ─────────────────────────────────────────────────────
  if (INITIAL_USDC_DEPOSIT > 0n) {
    // Confirm deployer ATA exists; bail with helpful error if not.
    const ataInfo = await conn.getAccountInfo(deployerAta);
    if (!ataInfo) {
      console.error(
        `\n! Deployer USDC ATA ${deployerAta.toBase58()} not found. Run scripts/mint-demo-usdc.ts first.`,
      );
      process.exit(1);
    }

    const depositSig = await (escrow.methods as any)
      .deposit(new anchor.BN(INITIAL_USDC_DEPOSIT.toString()))
      .accounts({
        merchantEscrow: merchantEscrowPda,
        vault,
        merchantToken: deployerAta,
        merchant: deployer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([deployer])
      .rpc();
    console.log(`▷ deposit ${INITIAL_USDC_DEPOSIT} tx: ${depositSig}`);
    console.log(`  https://solscan.io/tx/${depositSig}?cluster=devnet`);
  } else {
    console.log("▷ INITIAL_USDC_DEPOSIT=0 — skipping deposit step.");
  }

  // ── 4. Final summary ────────────────────────────────────────────────────
  console.log("\n✅ Merchant ready.");
  console.log(JSON.stringify({
    networkId: NETWORK_ID.toString(),
    merchantId: MERCHANT_ID.toString(),
    merchantName: MERCHANT_NAME,
    marginBps: MARGIN_BPS,
    merchantEscrowPda: merchantEscrowPda.toBase58(),
    vault: vault.toBase58(),
    mint: mint.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    depositedBaseUnits: INITIAL_USDC_DEPOSIT.toString(),
  }, null, 2));
  printSolscan(merchantEscrowPda, vault);
}

function printSolscan(merchantEscrowPda: PublicKey, vault: PublicKey) {
  console.log("\nSolscan:");
  console.log(
    `  MerchantEscrow: https://solscan.io/account/${merchantEscrowPda.toBase58()}?cluster=devnet`,
  );
  console.log(
    `  Vault         : https://solscan.io/account/${vault.toBase58()}?cluster=devnet`,
  );
}

main().catch((e) => {
  console.error("init-merchant.ts failed:", e);
  process.exit(1);
});

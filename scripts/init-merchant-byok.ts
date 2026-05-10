// scripts/init-merchant-byok.ts — initialize a MerchantEscrow on devnet using
// a *third-party* merchant keypair (Bring Your Own Key), not the deployer.
// Idempotent on re-run.
//
// Why: scripts/init-merchant.ts uses the deployer as the merchant authority
// for demo speed. That works on-chain but proves nothing about the protocol's
// permissionlessness — anyone reading on-chain history would see all four
// MerchantEscrow PDAs sharing the same `merchant` pubkey. This BYOK variant
// proves a real third-party wallet can register and run a merchant:
//
//   1. Loads the merchant keypair from MERCHANT_KEY_PATH (default
//      keys/merchant-04.json). The merchant signs initialize_merchant
//      and pays for both the MerchantEscrow PDA rent and the vault ATA rent.
//   2. Loads the deployer keypair *only* to mint demo USDC into the
//      merchant's USDC ATA — the deployer is the mint authority on
//      keys/demo-usdc-mint.json, so no other wallet can mint. In production
//      you would buy / receive real USDC instead.
//   3. The merchant signs `deposit` to fund their own vault from their
//      own USDC ATA. Deployer is not involved in this step.
//
// On-chain state stored in MerchantEscrow:
//   { network_id, merchant_id, merchant (= MERCHANT_KEY pk), vault, totals... }
//
// The MerchantEscrow account has NO `name` or `margin_bps` field — those are
// network-level (margin_bps_max in ProtocolConfig) or off-chain demo metadata.
// We log/print the values for traceability but do not write them on-chain.
//
// Usage (from the alpha root):
//   MERCHANT_KEY_PATH=keys/merchant-04.json MERCHANT_ID=4 \
//     MERCHANT_NAME="Demo Merchant 04 (BYOK)" MARGIN_BPS=2500 \
//     INITIAL_USDC_DEPOSIT=25000000 pnpm exec tsx scripts/init-merchant-byok.ts

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
  createMintToInstruction,
} from "@solana/spl-token";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");

// CLI inputs
const MERCHANT_KEY_PATH = process.env.MERCHANT_KEY_PATH ?? "keys/merchant-04.json";
const MERCHANT_ID = BigInt(process.env.MERCHANT_ID ?? "4");
const MERCHANT_NAME =
  process.env.MERCHANT_NAME ?? `Demo Merchant ${MERCHANT_ID.toString().padStart(2, "0")} (BYOK)`;
const MARGIN_BPS = Number(process.env.MARGIN_BPS ?? "2500"); // ≤5000 per protocol cap
const INITIAL_USDC_DEPOSIT = BigInt(process.env.INITIAL_USDC_DEPOSIT ?? "25000000"); // base units (USDC has 6 decimals)

// Lower bound for merchant SOL balance before we start. Math:
//   tx fee                   ~0.000005 SOL × 3 txs
//   merchant USDC ATA rent   ~0.00204 SOL
//   vault ATA rent           ~0.00204 SOL
//   MerchantEscrow PDA rent  ~0.00237 SOL (145 bytes data)
//   total                    ~0.00646 SOL
// We require 0.01 SOL for safety margin.
const MIN_MERCHANT_LAMPORTS = 0.01 * 1_000_000_000;

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
  if (MERCHANT_ID === 1n || MERCHANT_ID === 2n || MERCHANT_ID === 3n) {
    console.error(
      `MERCHANT_ID=${MERCHANT_ID} clashes with existing demo merchants 1/2/3. Pick a fresh id (default 4).`,
    );
    process.exit(1);
  }

  const merchantKeyAbs = path.isAbsolute(MERCHANT_KEY_PATH)
    ? MERCHANT_KEY_PATH
    : path.join(root, MERCHANT_KEY_PATH);
  if (!fs.existsSync(merchantKeyAbs)) {
    console.error(`MERCHANT_KEY_PATH does not exist: ${merchantKeyAbs}`);
    process.exit(1);
  }

  const conn = new Connection(RPC, "confirmed");
  const merchantKp = loadKeypair(merchantKeyAbs);
  const deployer = loadKeypair(path.join(root, "keys", "devnet-deployer.json"));

  // The provider's wallet is the merchant — the merchant pays fees and signs
  // any sendAndConfirm. Deployer is a side-signer only for the mintTo step.
  const wallet = new anchor.Wallet(merchantKp);
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

  // Merchant's USDC ATA — funding source for the deposit.
  const merchantAta = getAssociatedTokenAddressSync(
    mint,
    merchantKp.publicKey,
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
  console.log(`  merchant key file   : ${merchantKeyAbs}`);
  console.log(`  merchant pubkey     : ${merchantKp.publicKey.toBase58()}`);
  console.log(`  deployer (mint auth): ${deployer.publicKey.toBase58()}`);
  console.log(`  USDC mint           : ${mint.toBase58()}`);
  console.log(`  MerchantEscrow PDA  : ${merchantEscrowPda.toBase58()}`);
  console.log(`  Vault (ATA)         : ${vault.toBase58()}`);
  console.log(`  Merchant USDC ATA   : ${merchantAta.toBase58()}`);
  console.log("──────────────────────────────────────────────────────────");

  // ── 0. Sanity-check merchant SOL balance ────────────────────────────────
  const merchantLamports = await conn.getBalance(merchantKp.publicKey, "confirmed");
  console.log(
    `▷ Merchant SOL balance: ${(merchantLamports / 1_000_000_000).toFixed(6)} SOL ` +
      `(${merchantLamports} lamports)`,
  );
  if (merchantLamports < MIN_MERCHANT_LAMPORTS) {
    console.error(
      `\n! Merchant has < 0.01 SOL on devnet. Devnet faucets reject Cloudflare ` +
        `Worker IPs, so this script will not airdrop for you.\n` +
        `  Fund the merchant manually:\n` +
        `    1. Open https://faucet.solana.com\n` +
        `    2. Paste ${merchantKp.publicKey.toBase58()}\n` +
        `    3. Request 0.5 SOL on devnet\n` +
        `    4. Re-run this script.\n`,
    );
    process.exit(1);
  }

  // ── 1. Idempotency check ────────────────────────────────────────────────
  const existing = await conn.getAccountInfo(merchantEscrowPda);
  if (existing) {
    console.log(`▷ MerchantEscrow PDA already initialized — skipping init.`);
    // Still attempt deposit if requested and the vault is currently empty.
    // This makes the script useful as a "fund my existing merchant" tool too.
    if (INITIAL_USDC_DEPOSIT > 0n) {
      const vaultInfo = await conn.getAccountInfo(vault);
      if (!vaultInfo) {
        console.warn("  ! vault account missing despite escrow init — bailing");
        printSolscan(merchantEscrowPda, vault, merchantKp.publicKey);
        return;
      }
      let vaultBalanceStr = "?";
      try {
        const bal = await conn.getTokenAccountBalance(vault);
        vaultBalanceStr = bal.value.amount;
      } catch {
        // tolerated — fall through to deposit attempt
      }
      if (vaultBalanceStr !== "0" && vaultBalanceStr !== "?") {
        console.log(
          `  vault already holds ${vaultBalanceStr} base units; skipping deposit on re-run.`,
        );
        printSolscan(merchantEscrowPda, vault, merchantKp.publicKey);
        return;
      }
      console.log(`  vault is empty — proceeding with mint + deposit.`);
      await mintAndDeposit({
        conn,
        provider,
        escrow,
        deployer,
        merchantKp,
        mint,
        merchantAta,
        merchantEscrowPda,
        vault,
      });
      printSolscan(merchantEscrowPda, vault, merchantKp.publicKey);
      return;
    }
    printSolscan(merchantEscrowPda, vault, merchantKp.publicKey);
    return;
  }

  // ── 2. Create vault ATA + initialize_merchant in one tx ─────────────────
  // The merchant pays rent for the vault ATA AND signs initialize_merchant.
  // No deployer signature on this transaction.
  const createVaultIx = createAssociatedTokenAccountIdempotentInstruction(
    merchantKp.publicKey,         // payer (merchant pays vault rent)
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
      merchant: merchantKp.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new anchor.web3.Transaction().add(createVaultIx, initMerchantIx);
  const sig = await provider.sendAndConfirm(tx, [merchantKp], {
    commitment: "confirmed",
  });
  console.log(`▷ initialize_merchant tx: ${sig}`);
  console.log(`  https://solscan.io/tx/${sig}?cluster=devnet`);

  // ── 3. Mint demo USDC to merchant + deposit ─────────────────────────────
  if (INITIAL_USDC_DEPOSIT > 0n) {
    await mintAndDeposit({
      conn,
      provider,
      escrow,
      deployer,
      merchantKp,
      mint,
      merchantAta,
      merchantEscrowPda,
      vault,
    });
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
    merchant: merchantKp.publicKey.toBase58(),
    depositedBaseUnits: INITIAL_USDC_DEPOSIT.toString(),
  }, null, 2));
  printSolscan(merchantEscrowPda, vault, merchantKp.publicKey);
}

interface MintAndDepositArgs {
  conn: Connection;
  provider: AnchorProvider;
  escrow: Program;
  deployer: Keypair;
  merchantKp: Keypair;
  mint: PublicKey;
  merchantAta: PublicKey;
  merchantEscrowPda: PublicKey;
  vault: PublicKey;
}

// mintAndDeposit handles the two-step "give the merchant USDC, then have them
// deposit it into their own vault" sequence. Split out because we run it both
// on first init and on the idempotent "vault still empty" branch.
async function mintAndDeposit(args: MintAndDepositArgs) {
  const {
    provider,
    escrow,
    deployer,
    merchantKp,
    mint,
    merchantAta,
    merchantEscrowPda,
    vault,
  } = args;

  // 3a. Idempotent: ensure merchant USDC ATA exists, then mint USDC into it.
  // Merchant pays the rent for their own ATA (~0.00204 SOL).
  // Deployer signs the mintTo because they hold the mint authority.
  const createMerchantAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    merchantKp.publicKey,         // payer (merchant pays for their own ATA rent)
    merchantAta,                  // ata
    merchantKp.publicKey,         // owner
    mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const mintToIx = createMintToInstruction(
    mint,
    merchantAta,
    deployer.publicKey,           // mint authority
    INITIAL_USDC_DEPOSIT,
    [],
    TOKEN_PROGRAM_ID,
  );

  const mintTx = new anchor.web3.Transaction().add(createMerchantAtaIx, mintToIx);
  // Both signers required: merchant for ATA rent payment, deployer for mintTo.
  const mintSig = await provider.sendAndConfirm(mintTx, [merchantKp, deployer], {
    commitment: "confirmed",
  });
  console.log(`▷ mintTo ${INITIAL_USDC_DEPOSIT} tx: ${mintSig}`);
  console.log(`  https://solscan.io/tx/${mintSig}?cluster=devnet`);

  // 3b. Merchant signs deposit — funds vault from their own USDC ATA.
  const depositSig = await (escrow.methods as any)
    .deposit(new anchor.BN(INITIAL_USDC_DEPOSIT.toString()))
    .accounts({
      merchantEscrow: merchantEscrowPda,
      vault,
      merchantToken: merchantAta,
      merchant: merchantKp.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([merchantKp])
    .rpc();
  console.log(`▷ deposit ${INITIAL_USDC_DEPOSIT} tx: ${depositSig}`);
  console.log(`  https://solscan.io/tx/${depositSig}?cluster=devnet`);
}

function printSolscan(
  merchantEscrowPda: PublicKey,
  vault: PublicKey,
  merchant: PublicKey,
) {
  console.log("\nSolscan:");
  console.log(
    `  MerchantEscrow: https://solscan.io/account/${merchantEscrowPda.toBase58()}?cluster=devnet`,
  );
  console.log(
    `  Vault         : https://solscan.io/account/${vault.toBase58()}?cluster=devnet`,
  );
  console.log(
    `  Merchant      : https://solscan.io/account/${merchant.toBase58()}?cluster=devnet`,
  );
}

main().catch((e) => {
  console.error("init-merchant-byok.ts failed:", e);
  process.exit(1);
});

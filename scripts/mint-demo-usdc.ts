// scripts/mint-demo-usdc.ts — create the mock USDC SPL token (legacy Token
// program) on devnet, mint a generous balance to the deployer for seeding.
//
// We use legacy SPL Token (not Token-2022) for V1 to keep the on-chain
// escrow program simple. The pitch is honest about this:
// "production target is canonical USDC; demo uses a mock SPL token mint
// labelled 'Demo USDC (devnet)'." See docs/12 §9.

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const root = path.resolve(import.meta.dirname, "..");

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[]),
  );
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = loadKeypair(path.join(root, "keys", "devnet-deployer.json"));

  const mintPath = path.join(root, "keys", "demo-usdc-mint.json");
  let mint: Keypair;
  if (fs.existsSync(mintPath)) {
    mint = loadKeypair(mintPath);
    const info = await conn.getAccountInfo(mint.publicKey);
    if (info) {
      console.log("Demo USDC mint already exists:", mint.publicKey.toBase58());
      console.log("Skipping mint creation.");
      return;
    }
  } else {
    mint = Keypair.generate();
    fs.writeFileSync(mintPath, JSON.stringify(Array.from(mint.secretKey)));
    console.log("Generated new mint keypair → keys/demo-usdc-mint.json");
  }

  const decimals = 6;
  const lamports = await getMinimumBalanceForRentExemptMint(conn);
  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  tx.add(
    createInitializeMint2Instruction(
      mint.publicKey,
      decimals,
      payer.publicKey,
      payer.publicKey,
      TOKEN_PROGRAM_ID,
    ),
  );
  const ata = getAssociatedTokenAddressSync(
    mint.publicKey,
    payer.publicKey,
    false,
    TOKEN_PROGRAM_ID,
  );
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      mint.publicKey,
      TOKEN_PROGRAM_ID,
    ),
  );
  tx.add(
    createMintToInstruction(
      mint.publicKey,
      ata,
      payer.publicKey,
      10_000_000n * 10n ** BigInt(decimals),
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [payer, mint], {
    commitment: "confirmed",
  });
  console.log("✅ Demo USDC mint:", mint.publicKey.toBase58());
  console.log("   Deployer ATA  :", ata.toBase58());
  console.log("   tx            :", sig);
  console.log("");
  console.log("Set NEXT_PUBLIC_DEMO_USDC_MINT and DEMO_USDC_MINT to:");
  console.log("  ", mint.publicKey.toBase58());
}

main().catch((e) => {
  console.error("mint-demo-usdc.ts failed:", e);
  process.exit(1);
});

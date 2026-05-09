// scripts/e2e-smoke.ts — devnet-side end-to-end happy path.
//
// Assumes seed-demo.ts has been run.
// Steps:
//   1. Pick wallet E (deepest in the demo tree)
//   2. Trigger a record_purchase for E in the current cycle
//   3. Print the on-chain PurchaseRecord PDA + tx for Solscan inspection
//
// Output: a JSON receipt with everything needed to verify on-chain state.

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
const PURCHASER_LABEL = process.env.PURCHASER ?? "E";
const AMOUNT = BigInt(process.env.AMOUNT ?? "1000"); // base units
const root = path.resolve(import.meta.dirname, "..");

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

  const purchaserKp = loadKeypair(path.join(root, "keys", `demo-${PURCHASER_LABEL}.json`));
  const [positionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(NETWORK_ID), purchaserKp.publicKey.toBuffer()],
    networkProgramId,
  );

  // Read network state to get cycle_index
  const networkAccount: any = await (network.account as any).networkState.fetch(networkPda);
  const round = BigInt(networkAccount.cycleIndex.toString());

  const [purchasePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("purchase"),
      u64Le(NETWORK_ID),
      purchaserKp.publicKey.toBuffer(),
      u64Le(round),
    ],
    networkProgramId,
  );

  console.log("Recording purchase:");
  console.log("  buyer (label)  :", PURCHASER_LABEL);
  console.log("  buyer (pubkey) :", purchaserKp.publicKey.toBase58());
  console.log("  amount         :", AMOUNT.toString());
  console.log("  round          :", round.toString());
  console.log("  position PDA   :", positionPda.toBase58());
  console.log("  purchase PDA   :", purchasePda.toBase58());

  const sig = await (network.methods as any).recordPurchase(
    new anchor.BN(round.toString()),
    new anchor.BN(AMOUNT.toString()),
  )
    .accounts({
      network: networkPda,
      position: positionPda,
      purchase: purchasePda,
      oracleAuthority: deployer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([deployer])
    .rpc();

  console.log("\n✅ record_purchase tx:", sig);
  console.log("Solscan:", `https://solscan.io/tx/${sig}?cluster=devnet`);

  // Output receipt JSON for the README / submission
  const receipt = {
    cluster: "devnet",
    networkId: NETWORK_ID.toString(),
    buyer: purchaserKp.publicKey.toBase58(),
    amount: AMOUNT.toString(),
    round: round.toString(),
    positionPda: positionPda.toBase58(),
    purchasePda: purchasePda.toBase58(),
    transaction: sig,
    solscan: `https://solscan.io/tx/${sig}?cluster=devnet`,
    recordedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(root, "submission", "smoke-receipt.json"),
    JSON.stringify(receipt, null, 2),
  );
  console.log("Receipt written → submission/smoke-receipt.json");
}

main().catch((e) => {
  console.error("e2e-smoke.ts failed:", e);
  process.exit(1);
});

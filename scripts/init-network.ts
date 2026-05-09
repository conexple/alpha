// scripts/init-network.ts — one-shot, idempotent initialization of the four
// PDAs that bootstrap a network on devnet:
//
//   1. ProtocolConfig          — initialize_rules
//   2. OracleRegistry + signer — initialize_registry + register_oracle
//   3. NetworkState            — initialize_network
//   4. PoolAccount             — initialize_pool
//
// Each step is wrapped in a try/catch on `account already exists` errors so
// re-running the script after partial failure is safe.

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_ID = BigInt(process.env.NETWORK_ID ?? "1");
const CYCLE_SECONDS = BigInt(24 * 60 * 60); // daily

const root = path.resolve(import.meta.dirname, "..");

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

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const deployer = loadKeypair(path.join(root, "keys", "devnet-deployer.json"));
  const wallet = new anchor.Wallet(deployer);
  const provider = new AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Oracle = same as deployer for V1 demo (one keypair signs everything).
  // Production would split these into separate identities.
  const oracle = deployer;

  const protocolKp = programKeypair("conexple_protocol");
  const networkKp = programKeypair("conexple_network");
  const escrowKp = programKeypair("conexple_escrow");
  const oracleKp = programKeypair("conexple_oracle");

  const protocol = new Program(loadIdl("conexple_protocol"), provider);
  const network = new Program(loadIdl("conexple_network"), provider);
  const escrow = new Program(loadIdl("conexple_escrow"), provider);
  const oracleProgram = new Program(loadIdl("conexple_oracle"), provider);

  // PDA derivations
  const u64Le = (n: bigint): Buffer => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(n);
    return buf;
  };
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), u64Le(NETWORK_ID)],
    protocolKp.publicKey,
  );
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry"), u64Le(NETWORK_ID)],
    oracleKp.publicKey,
  );
  const [networkPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(NETWORK_ID)],
    networkKp.publicKey,
  );
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(NETWORK_ID)],
    escrowKp.publicKey,
  );

  console.log("Network ID:", NETWORK_ID.toString());
  console.log("Deployer:", deployer.publicKey.toBase58());
  console.log("Config PDA:", configPda.toBase58());
  console.log("Network PDA:", networkPda.toBase58());
  console.log("Pool PDA:", poolPda.toBase58());

  // ── 1. initialize_rules ────────────────────────────────────────────────
  await safeRun("initialize_rules", configPda, conn, async () => {
    const ix = await (protocol.methods as any).initializeRules({
      networkId: new anchor.BN(NETWORK_ID.toString()),
      marginBpsMax: 5000,
      multiplier: 10,
      cycle: { daily: {} },
      poolSplitBps: 9000,
      infinityMinSpendMultiple: 10,
      infinityMinConsecutiveCycles: 3,
    })
      .accounts({
        config: configPda,
        admin: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();
    console.log("  → initialize_rules tx", ix);
  });

  // ── 2. initialize_registry + register_oracle ──────────────────────────
  await safeRun("initialize_registry", registryPda, conn, async () => {
    const ix = await (oracleProgram.methods as any).initializeRegistry(
      new anchor.BN(NETWORK_ID.toString()),
    )
      .accounts({
        registry: registryPda,
        admin: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();
    console.log("  → initialize_registry tx", ix);
  });

  // register the oracle (idempotent — handler checks duplicate)
  try {
    const ix = await (oracleProgram.methods as any).registerOracle(oracle.publicKey)
      .accounts({
        registry: registryPda,
        admin: deployer.publicKey,
      })
      .signers([deployer])
      .rpc();
    console.log("  → register_oracle tx", ix);
  } catch (e) {
    console.log("  → register_oracle skipped (likely already registered):", String(e).slice(0, 120));
  }

  // ── 3. initialize_network ──────────────────────────────────────────────
  await safeRun("initialize_network", networkPda, conn, async () => {
    const ix = await (network.methods as any).initializeNetwork(
      new anchor.BN(NETWORK_ID.toString()),
      oracle.publicKey,
      new anchor.BN(CYCLE_SECONDS.toString()),
    )
      .accounts({
        network: networkPda,
        admin: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();
    console.log("  → initialize_network tx", ix);
  });

  // ── 4. initialize_pool ─────────────────────────────────────────────────
  await safeRun("initialize_pool", poolPda, conn, async () => {
    const ix = await (escrow.methods as any).initializePool(
      new anchor.BN(NETWORK_ID.toString()),
      9000,
    )
      .accounts({
        pool: poolPda,
        admin: deployer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();
    console.log("  → initialize_pool tx", ix);
  });

  console.log("\n✅ Network bootstrap complete.");
  console.log(JSON.stringify({
    networkId: NETWORK_ID.toString(),
    config: configPda.toBase58(),
    network: networkPda.toBase58(),
    pool: poolPda.toBase58(),
    registry: registryPda.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    oracle: oracle.publicKey.toBase58(),
  }, null, 2));
}

async function safeRun(label: string, pda: PublicKey, conn: Connection, fn: () => Promise<void>) {
  const info = await conn.getAccountInfo(pda);
  if (info) {
    console.log(`▷ ${label}: PDA exists, skipping`);
    return;
  }
  console.log(`▷ ${label}:`);
  try {
    await fn();
  } catch (e) {
    const msg = String(e);
    if (msg.includes("already in use") || msg.includes("0x0")) {
      console.log(`  (already initialized — race)`);
      return;
    }
    throw e;
  }
}

main().catch((e) => {
  console.error("init-network.ts failed:", e);
  process.exit(1);
});

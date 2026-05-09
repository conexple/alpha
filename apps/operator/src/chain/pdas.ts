import { PublicKey } from "@solana/web3.js";
import type { Env } from "../env";

const u64Le = (n: bigint | number): Buffer => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
};

export function networkId(env: Env): bigint {
  return BigInt(env.NETWORK_ID);
}

export function networkProgramId(env: Env): PublicKey {
  return new PublicKey(env.PROGRAM_ID_NETWORK);
}

export function escrowProgramId(env: Env): PublicKey {
  return new PublicKey(env.PROGRAM_ID_ESCROW);
}

export function oracleProgramId(env: Env): PublicKey {
  return new PublicKey(env.PROGRAM_ID_ORACLE);
}

export function protocolProgramId(env: Env): PublicKey {
  return new PublicKey(env.PROGRAM_ID_PROTOCOL);
}

export function networkPda(env: Env): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(networkId(env))],
    networkProgramId(env),
  );
}

export function configPda(env: Env): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), u64Le(networkId(env))],
    protocolProgramId(env),
  );
}

export function positionPda(env: Env, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(networkId(env)), wallet.toBuffer()],
    networkProgramId(env),
  );
}

export function purchasePda(
  env: Env,
  wallet: PublicKey,
  round: bigint,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("purchase"), u64Le(networkId(env)), wallet.toBuffer(), u64Le(round)],
    networkProgramId(env),
  );
}

export function merchantPda(env: Env, merchantId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), u64Le(networkId(env)), u64Le(merchantId)],
    escrowProgramId(env),
  );
}

export function poolPda(env: Env): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(networkId(env))],
    escrowProgramId(env),
  );
}

export function oracleRegistryPda(env: Env): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry"), u64Le(networkId(env))],
    oracleProgramId(env),
  );
}

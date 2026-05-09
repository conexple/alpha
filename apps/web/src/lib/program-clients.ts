// Browser-side helpers to read Conexple state from the deployed devnet
// programs. We use direct getAccountInfo + manual decoding because in V1
// the IDL JSONs are not yet bundled with the frontend — `apps/web` is
// deployed before the SDK package generates IDL types.
//
// Once `target/idl/*.json` is committed (post-anchor-build), replace this
// with proper Anchor program clients via @coral-xyz/anchor `Program`.

import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const PROGRAM_PROTOCOL = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_PROTOCOL ?? "Coneprotect11111111111111111111111111111111",
);
export const PROGRAM_NETWORK = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_NETWORK ?? "Conenetwork111111111111111111111111111111111",
);
export const PROGRAM_ESCROW = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ESCROW ?? "Coneescrow1111111111111111111111111111111111",
);
export const PROGRAM_ORACLE = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ORACLE ?? "Coneoracle1111111111111111111111111111111111",
);

export const NETWORK_ID = BigInt(process.env.NEXT_PUBLIC_NETWORK_ID ?? "1");

export function connection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

const u64Le = (n: bigint): Buffer => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
};

export function networkPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(NETWORK_ID)],
    PROGRAM_NETWORK,
  )[0];
}
export function configPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), u64Le(NETWORK_ID)],
    PROGRAM_PROTOCOL,
  )[0];
}
export function positionPda(wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(NETWORK_ID), wallet.toBuffer()],
    PROGRAM_NETWORK,
  )[0];
}
export function poolPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(NETWORK_ID)],
    PROGRAM_ESCROW,
  )[0];
}

/** Decoded Position view — limited fields, no codec library. */
export interface PositionView {
  exists: boolean;
  parent: PublicKey | null;
  depth: number;
  status: "active" | "expired";
  cumulativeEarned: bigint;
  earningsCap: bigint;
  lastPurchaseRound: bigint;
  joinedAt: bigint;
  extensionLocked: boolean;
}

export async function readPosition(wallet: PublicKey): Promise<PositionView> {
  const conn = connection();
  const pda = positionPda(wallet);
  const info = await conn.getAccountInfo(pda);
  if (!info) {
    return {
      exists: false,
      parent: null,
      depth: 0,
      status: "active",
      cumulativeEarned: 0n,
      earningsCap: 0n,
      lastPurchaseRound: 0n,
      joinedAt: 0n,
      extensionLocked: false,
    };
  }
  // Manual layout decode matching programs/conexple-network/src/state.rs.
  // anchor account layout: 8-byte discriminator + struct fields in order.
  const data = info.data;
  let cur = 8; // skip discriminator
  // bump u8
  cur += 1;
  // network_id u64
  cur += 8;
  // wallet 32
  cur += 32;
  // parent Option<Pubkey> = 1 byte tag + (32 if Some, 0 if None)
  const parentTag = data.readUInt8(cur); cur += 1;
  let parent: PublicKey | null = null;
  if (parentTag === 1) {
    parent = new PublicKey(data.subarray(cur, cur + 32));
    cur += 32;
  }
  const depth = data.readUInt8(cur); cur += 1;
  const statusByte = data.readUInt8(cur); cur += 1;
  const status: "active" | "expired" = statusByte === 0 ? "active" : "expired";
  const cumulativeEarned = data.readBigUInt64LE(cur); cur += 8;
  const earningsCap = data.readBigUInt64LE(cur); cur += 8;
  const lastPurchaseRound = data.readBigUInt64LE(cur); cur += 8;
  const extensionLocked = data.readUInt8(cur) === 1; cur += 1;
  const joinedAt = data.readBigInt64LE(cur);
  return {
    exists: true,
    parent,
    depth,
    status,
    cumulativeEarned,
    earningsCap,
    lastPurchaseRound,
    extensionLocked,
    joinedAt,
  };
}

export interface NetworkView {
  exists: boolean;
  cycleIndex: bigint;
  cycleStartedAt: bigint;
  memberCount: bigint;
  oracle: PublicKey | null;
}

export async function readNetwork(): Promise<NetworkView> {
  const conn = connection();
  const info = await conn.getAccountInfo(networkPda());
  if (!info) {
    return { exists: false, cycleIndex: 0n, cycleStartedAt: 0n, memberCount: 0n, oracle: null };
  }
  const data = info.data;
  let cur = 8;
  cur += 1;       // bump
  cur += 8;       // network_id
  cur += 32;      // admin
  const oracle = new PublicKey(data.subarray(cur, cur + 32)); cur += 32;
  cur += 8;       // cycle_seconds
  const cycleIndex = data.readBigUInt64LE(cur); cur += 8;
  const cycleStartedAt = data.readBigInt64LE(cur); cur += 8;
  const memberCount = data.readBigUInt64LE(cur);
  return { exists: true, cycleIndex, cycleStartedAt, memberCount, oracle };
}

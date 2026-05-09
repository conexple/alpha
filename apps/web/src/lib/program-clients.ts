// Browser-side chain reader for Conexple devnet programs.
//
// Manual byte decoding (no Anchor codegen) keeps the bundle small and
// avoids pulling Anchor into the client. Account layouts mirror
// programs/conexple-network/src/state.rs exactly.

import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

function safePubkey(s: string | undefined, fallback: string): PublicKey {
  try {
    return new PublicKey(s && s.length > 0 ? s : fallback);
  } catch {
    return new PublicKey(fallback);
  }
}

export const PROGRAM_PROTOCOL = safePubkey(
  process.env.NEXT_PUBLIC_PROGRAM_PROTOCOL,
  SYSTEM_PROGRAM_ID,
);
export const PROGRAM_NETWORK = safePubkey(
  process.env.NEXT_PUBLIC_PROGRAM_NETWORK,
  SYSTEM_PROGRAM_ID,
);
export const PROGRAM_ESCROW = safePubkey(
  process.env.NEXT_PUBLIC_PROGRAM_ESCROW,
  SYSTEM_PROGRAM_ID,
);
export const PROGRAM_ORACLE = safePubkey(
  process.env.NEXT_PUBLIC_PROGRAM_ORACLE,
  SYSTEM_PROGRAM_ID,
);

export const NETWORK_ID = BigInt(process.env.NEXT_PUBLIC_NETWORK_ID ?? "1");
export const DEMO_USDC_MINT = safePubkey(
  process.env.NEXT_PUBLIC_DEMO_USDC_MINT,
  SYSTEM_PROGRAM_ID,
);

export function connection(): Connection {
  return new Connection(RPC_URL, { commitment: "confirmed" });
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

// ── Account sizes (mirror programs/.../state.rs SIZE constants) ───────────

const POSITION_SIZE =
  8 + 1 + 8 + 32 + (1 + 32) + 1 + 1 + 8 + 8 + 8 + 1 + 8 + (1 + 8) + 64;
const PURCHASE_SIZE = 8 + 1 + 8 + 32 + 8 + 8 + 4 + 8 + 32;

// ── Position view ─────────────────────────────────────────────────────────

export interface PositionView {
  pubkey: PublicKey;
  wallet: PublicKey;
  parent: PublicKey | null;
  depth: number;
  status: "active" | "expired";
  cumulativeEarned: bigint;
  earningsCap: bigint;
  lastPurchaseRound: bigint;
  extensionLocked: boolean;
  joinedAt: bigint;
  expiredAt: bigint | null;
}

function decodePosition(pubkey: PublicKey, data: Buffer): PositionView {
  let cur = 8; // discriminator
  cur += 1; // bump
  cur += 8; // network_id
  const wallet = new PublicKey(data.subarray(cur, cur + 32)); cur += 32;
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
  const joinedAt = data.readBigInt64LE(cur); cur += 8;
  const expiredTag = data.readUInt8(cur); cur += 1;
  let expiredAt: bigint | null = null;
  if (expiredTag === 1) {
    expiredAt = data.readBigInt64LE(cur);
  }
  return {
    pubkey, wallet, parent, depth, status,
    cumulativeEarned, earningsCap, lastPurchaseRound,
    extensionLocked, joinedAt, expiredAt,
  };
}

export async function readPosition(wallet: PublicKey): Promise<PositionView | null> {
  const conn = connection();
  const pda = positionPda(wallet);
  const info = await conn.getAccountInfo(pda);
  if (!info) return null;
  return decodePosition(pda, info.data);
}

export async function readAllPositions(): Promise<PositionView[]> {
  const conn = connection();
  const accounts = await conn.getProgramAccounts(PROGRAM_NETWORK, {
    commitment: "confirmed",
    filters: [{ dataSize: POSITION_SIZE }],
  });
  const out: PositionView[] = [];
  for (const acc of accounts) {
    try {
      out.push(decodePosition(acc.pubkey, acc.account.data));
    } catch {}
  }
  out.sort((a, b) => Number(a.joinedAt - b.joinedAt));
  return out;
}

// ── Network view ──────────────────────────────────────────────────────────

export interface NetworkView {
  pubkey: PublicKey;
  cycleIndex: bigint;
  cycleStartedAt: bigint;
  cycleSeconds: bigint;
  memberCount: bigint;
  oracle: PublicKey;
  admin: PublicKey;
}

export async function readNetwork(): Promise<NetworkView | null> {
  const conn = connection();
  const pda = networkPda();
  const info = await conn.getAccountInfo(pda);
  if (!info) return null;
  const data = info.data;
  let cur = 8;
  cur += 1;
  cur += 8;
  const admin = new PublicKey(data.subarray(cur, cur + 32)); cur += 32;
  const oracle = new PublicKey(data.subarray(cur, cur + 32)); cur += 32;
  const cycleSeconds = data.readBigInt64LE(cur); cur += 8;
  const cycleIndex = data.readBigUInt64LE(cur); cur += 8;
  const cycleStartedAt = data.readBigInt64LE(cur); cur += 8;
  const memberCount = data.readBigUInt64LE(cur);
  return {
    pubkey: pda,
    cycleIndex,
    cycleStartedAt: BigInt(cycleStartedAt),
    cycleSeconds: BigInt(cycleSeconds),
    memberCount,
    oracle,
    admin,
  };
}

// ── Purchase view ─────────────────────────────────────────────────────────

export interface PurchaseView {
  pubkey: PublicKey;
  wallet: PublicKey;
  round: bigint;
  totalAmount: bigint;
  purchaseCount: number;
  lastAt: bigint;
}

function decodePurchase(pubkey: PublicKey, data: Buffer): PurchaseView {
  let cur = 8;
  cur += 1; cur += 8;
  const wallet = new PublicKey(data.subarray(cur, cur + 32)); cur += 32;
  const round = data.readBigUInt64LE(cur); cur += 8;
  const totalAmount = data.readBigUInt64LE(cur); cur += 8;
  const purchaseCount = data.readUInt32LE(cur); cur += 4;
  const lastAt = data.readBigInt64LE(cur);
  return { pubkey, wallet, round, totalAmount, purchaseCount, lastAt };
}

export async function readAllPurchases(): Promise<PurchaseView[]> {
  const conn = connection();
  const accounts = await conn.getProgramAccounts(PROGRAM_NETWORK, {
    commitment: "confirmed",
    filters: [{ dataSize: PURCHASE_SIZE }],
  });
  const out: PurchaseView[] = [];
  for (const acc of accounts) {
    try {
      out.push(decodePurchase(acc.pubkey, acc.account.data));
    } catch {}
  }
  out.sort((a, b) => Number(b.lastAt - a.lastAt));
  return out;
}

// ── Recent network signatures ────────────────────────────────────────────

export interface TxSummary {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export async function recentNetworkTxs(limit = 12): Promise<TxSummary[]> {
  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(PROGRAM_NETWORK, { limit });
  return sigs.map((s) => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    err: s.err,
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function shortenPub(s: PublicKey | string, n = 4): string {
  const x = typeof s === "string" ? s : s.toBase58();
  return `${x.slice(0, n)}…${x.slice(-n)}`;
}

export function solscanAccount(p: PublicKey | string): string {
  const x = typeof p === "string" ? p : p.toBase58();
  return `https://solscan.io/account/${x}?cluster=devnet`;
}
export function solscanTx(sig: string): string {
  return `https://solscan.io/tx/${sig}?cluster=devnet`;
}

export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "") || "0";
  return `${whole.toString()}.${fracStr}`;
}

export function relativeTime(unixSec: bigint | number): string {
  const t = typeof unixSec === "bigint" ? Number(unixSec) : unixSec;
  if (!t) return "—";
  const diff = Math.floor(Date.now() / 1000) - t;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

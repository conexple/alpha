// Wire types matching the Anchor program account layouts.
// Hand-written for V1 — replace with generated types after `anchor build`
// produces the IDL JSON in `target/idl/`.

import type { PublicKey } from "@solana/web3.js";

export interface ProtocolConfig {
  bump: number;
  networkId: bigint;
  admin: PublicKey;
  levelCount: number;
  splitParts: number;
  marginBpsMax: number;
  multiplier: number;
  cycle: number;          // SettlementCycle enum tag
  poolSplitBps: number;
  infinityMinSpendMultiple: number;
  infinityMinConsecutiveCycles: number;
  createdAt: bigint;
}

export interface NetworkState {
  bump: number;
  networkId: bigint;
  admin: PublicKey;
  oracle: PublicKey;
  cycleSeconds: bigint;
  cycleIndex: bigint;
  cycleStartedAt: bigint;
  memberCount: bigint;
}

export type PositionStatus = "Active" | "Expired";

export interface Position {
  bump: number;
  networkId: bigint;
  wallet: PublicKey;
  parent: PublicKey | null;
  depth: number;
  status: PositionStatus;
  cumulativeEarned: bigint;
  earningsCap: bigint;
  lastPurchaseRound: bigint;
  extensionLocked: boolean;
  joinedAt: bigint;
  expiredAt: bigint | null;
}

export interface PurchaseRecord {
  bump: number;
  networkId: bigint;
  wallet: PublicKey;
  round: bigint;
  totalAmount: bigint;
  purchaseCount: number;
  lastAt: bigint;
}

export interface MerchantEscrow {
  bump: number;
  networkId: bigint;
  merchantId: bigint;
  merchant: PublicKey;
  vault: PublicKey;
  depositedTotal: bigint;
  paidOutTotal: bigint;
  voidedTotal: bigint;
}

export interface PoolAccount {
  bump: number;
  networkId: bigint;
  admin: PublicKey;
  socialBalance: bigint;
  operatorBalance: bigint;
  poolSplitBps: number;
}

export type PendingKind = "LevelCommission" | "InfinityOverride" | "SocialPool" | "OperatorPool";
export type PendingStatus = "Pending" | "Settled" | "Voided";

export interface PendingCommission {
  bump: number;
  networkId: bigint;
  merchantId: bigint;
  purchaseId: bigint;
  recipient: PublicKey;
  kind: PendingKind;
  amount: bigint;
  anchorAt: bigint;
  settleAt: bigint;
  status: PendingStatus;
}

export interface OracleRegistry {
  bump: number;
  networkId: bigint;
  admin: PublicKey;
  signers: PublicKey[];
}

// Browser-side write paths against Conexple devnet programs.
//
// Mirror of the read-side pattern in program-clients.ts: manual instruction
// construction so we don't pull the @coral-xyz/anchor runtime into the
// browser bundle. Discriminators come from packages/sdk/src/idl/*.json
// (Anchor 0.30+ IDL spec).

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  type Connection,
  type VersionedTransaction,
  type SendOptions,
} from "@solana/web3.js";
import {
  connection,
  networkPda,
  positionPda,
  PROGRAM_NETWORK,
} from "./program-clients";

// Anchor IDL: programs/conexple-network → register_member
//   args: initial_spend (u64), multiplier (u32)
//   accounts: [network (mut), position (mut), wallet (mut signer), system_program]
const REGISTER_MEMBER_DISCRIMINATOR = Uint8Array.from([
  44, 19, 160, 59, 17, 122, 38, 16,
]);

export function buildRegisterMemberIx(
  wallet: PublicKey,
  initialSpend: bigint,
  multiplier: number,
): TransactionInstruction {
  const data = new Uint8Array(8 + 8 + 4);
  data.set(REGISTER_MEMBER_DISCRIMINATOR, 0);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, initialSpend, true);
  view.setUint32(16, multiplier, true);

  return new TransactionInstruction({
    programId: PROGRAM_NETWORK,
    keys: [
      { pubkey: networkPda(), isSigner: false, isWritable: true },
      { pubkey: positionPda(wallet), isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

// Matches @solana/wallet-adapter-react's `useWallet().sendTransaction`.
export interface WalletLike {
  publicKey: PublicKey;
  sendTransaction: (
    tx: Transaction | VersionedTransaction,
    conn: Connection,
    opts?: SendOptions,
  ) => Promise<string>;
}

/**
 * Submit register_member from a connected wallet. Returns the tx signature.
 * Throws on failure (caller surfaces error.message).
 */
export async function registerMember(
  wallet: WalletLike,
  initialSpend: bigint,
  multiplier: number,
): Promise<string> {
  if (initialSpend <= 0n) throw new Error("initial_spend must be > 0");
  if (multiplier <= 0) throw new Error("multiplier must be > 0");

  const conn = connection();
  const ix = buildRegisterMemberIx(wallet.publicKey, initialSpend, multiplier);
  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  const signature = await wallet.sendTransaction(tx, conn);
  await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

/**
 * Ask the operator's placement engine where this wallet would be placed
 * under a given referrer, without actually submitting place_member on chain.
 * Returns null on failure (treat as "no preview available").
 */
export async function previewPlacement(
  referrer: string,
  newWallet: string,
): Promise<{ parent: string; depth: number; reason: string } | null> {
  const url =
    process.env.NEXT_PUBLIC_OPERATOR_URL ??
    "https://conexple-worker-operator.sornwin.workers.dev";
  try {
    const r = await fetch(`${url}/placement/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referrer, new_wallet: newWallet }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { parent: string; depth: number; reason: string };
  } catch {
    return null;
  }
}

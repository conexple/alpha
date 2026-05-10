// Direct-call helpers for conexple_network::add_earnings.
//
// Why a hand-rolled helper instead of pulling Anchor into the Worker bundle:
//   * Anchor's Program client requires the wallet abstraction + a Provider,
//     which is heavier than what we need here. We just need to build the
//     instruction with the correct discriminator + the right account list.
//   * Keeping the worker bundle small matters on Cloudflare's free plan.
//
// The on-chain CPI documented in escrow.rs is `escrow::execute_payout` →
// `network::add_earnings(level_n_recipient, amount)`. For the V1 demo we
// invoke `add_earnings` directly from the oracle-signed worker — which is
// exactly the action that bumps `Position.cumulative_earned`. The escrow
// USDC-transfer half of the spec is only meaningful when a `MerchantEscrow`
// PDA exists with a funded vault; for the hackathon demo (no funded vault),
// we settle the commission accrual on-chain so the explorer shows non-zero
// "Earned" totals — which is the headline credibility signal.
//
// docs/03 §4 still holds: `network` is the only program that mutates
// `Position`. We're not bypassing that — we're calling its public
// instruction with the network-registered oracle as signer.

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Env } from "../env";
import { networkPda, networkProgramId, positionPda } from "./pdas";

// Anchor instruction discriminator for `add_earnings`, copied verbatim from
// target/idl/conexple_network.json. Hard-coded so we don't pay the cost of
// shipping the full IDL into the Worker bundle.
const ADD_EARNINGS_DISCRIMINATOR = Buffer.from([
  33, 238, 51, 61, 134, 44, 42, 111,
]);

export function buildAddEarningsIx(
  env: Env,
  recipientWallet: PublicKey,
  oracleAuthority: PublicKey,
  amount: bigint,
): TransactionInstruction {
  const [netPda] = networkPda(env);
  const [posPda] = positionPda(env, recipientWallet);

  const data = Buffer.alloc(8 + 8);
  ADD_EARNINGS_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amount, 8);

  return new TransactionInstruction({
    programId: networkProgramId(env),
    keys: [
      { pubkey: netPda, isSigner: false, isWritable: false },
      { pubkey: posPda, isSigner: false, isWritable: true },
      { pubkey: oracleAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/**
 * Build + sign + send a transaction containing one or more add_earnings
 * instructions. Returns the confirmed signature.
 *
 * Caller is responsible for grouping by purchase_id (so that a single
 * cycle's batch produces one tx per purchase).
 */
export async function submitAddEarnings(
  conn: Connection,
  oracle: Keypair,
  ixs: TransactionInstruction[],
  commitment: "confirmed" | "finalized" = "confirmed",
): Promise<string> {
  if (ixs.length === 0) {
    throw new Error("submitAddEarnings: empty ix list");
  }
  // Headroom for tx with up to 6 add_earnings ixs.
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    .add(...ixs);

  const sig = await sendAndConfirmTransaction(conn, tx, [oracle], {
    commitment,
    skipPreflight: false,
  });
  return sig;
}

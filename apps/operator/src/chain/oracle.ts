import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { Env } from "../env";

/**
 * Decode the oracle keypair from `env.ORACLE_SECRET`.
 *
 * Accepted formats:
 *   - base58-encoded 64-byte secret key (what `solana-keygen` produces under
 *     `solana config get keypair`'s convention when run with --outfile and
 *     post-processed; or when we deliberately bs58-encode the JSON array)
 *   - JSON array string of 64 numbers (what `solana-keygen new -o` writes)
 */
export function loadOracleKeypair(env: Env): Keypair {
  const raw = env.ORACLE_SECRET?.trim();
  if (!raw) {
    throw new Error("ORACLE_SECRET is empty — set via `wrangler secret put ORACLE_SECRET`");
  }
  if (raw.startsWith("[")) {
    const arr = JSON.parse(raw) as number[];
    if (arr.length !== 64) {
      throw new Error("ORACLE_SECRET JSON array must contain exactly 64 numbers");
    }
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

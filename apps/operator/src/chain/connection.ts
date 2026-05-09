import { Connection } from "@solana/web3.js";
import type { Env } from "../env";

export function rpcUrl(env: Env): string {
  return env.HELIUS_RPC_URL?.length ? env.HELIUS_RPC_URL : env.SOLANA_RPC_FALLBACK;
}

export function connection(env: Env): Connection {
  return new Connection(rpcUrl(env), { commitment: "confirmed" });
}

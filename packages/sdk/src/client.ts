// Lightweight Anchor program client.
//
// Loads the IDL JSON from `target/idl/<name>.json` and binds it to a Program
// instance. For demo / scripts use only; the frontend should generate
// strongly typed clients from IDL via `@coral-xyz/anchor` codegen.

import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { Connection, type Commitment, PublicKey } from "@solana/web3.js";
import type { ProgramIds } from "./pdas";

export interface ConexpleProgramSet {
  protocol: Program;
  network: Program;
  escrow: Program;
  oracle: Program;
}

export function buildProvider(
  connection: Connection,
  wallet: any,
  commitment: Commitment = "confirmed",
): AnchorProvider {
  return new AnchorProvider(connection, wallet, { commitment });
}

/**
 * Bind IDLs to Program instances. The `idls` map is provided by the caller
 * (loaded at build time or from `fetch`) — the SDK does not embed the IDLs.
 */
export function bindPrograms(
  provider: AnchorProvider,
  idls: { protocol: Idl; network: Idl; escrow: Idl; oracle: Idl },
  ids: ProgramIds,
): ConexpleProgramSet {
  return {
    protocol: new Program(idls.protocol, provider),
    network: new Program(idls.network, provider),
    escrow: new Program(idls.escrow, provider),
    oracle: new Program(idls.oracle, provider),
  };
}

export function publicKeyOrNull(s: string | null | undefined): PublicKey | null {
  if (!s) return null;
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}

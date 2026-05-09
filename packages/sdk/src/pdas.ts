import { PublicKey } from "@solana/web3.js";

const u64Le = (n: bigint | number): Buffer => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
};

export interface ProgramIds {
  protocol: PublicKey;
  network: PublicKey;
  escrow: PublicKey;
  oracle: PublicKey;
}

export function configPda(programs: ProgramIds, networkId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), u64Le(networkId)],
    programs.protocol,
  );
}

export function networkPda(programs: ProgramIds, networkId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("network"), u64Le(networkId)],
    programs.network,
  );
}

export function positionPda(
  programs: ProgramIds,
  networkId: bigint,
  wallet: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), u64Le(networkId), wallet.toBuffer()],
    programs.network,
  );
}

export function purchasePda(
  programs: ProgramIds,
  networkId: bigint,
  wallet: PublicKey,
  round: bigint,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("purchase"), u64Le(networkId), wallet.toBuffer(), u64Le(round)],
    programs.network,
  );
}

export function merchantPda(
  programs: ProgramIds,
  networkId: bigint,
  merchantId: bigint,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("merchant"), u64Le(networkId), u64Le(merchantId)],
    programs.escrow,
  );
}

export function poolPda(programs: ProgramIds, networkId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(networkId)],
    programs.escrow,
  );
}

export function pendingPda(
  programs: ProgramIds,
  networkId: bigint,
  purchaseId: bigint,
  kind: number,
  slot: number,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pending"),
      u64Le(networkId),
      u64Le(purchaseId),
      Buffer.from([kind & 0xff]),
      Buffer.from([slot & 0xff]),
    ],
    programs.escrow,
  );
}

export function oracleRegistryPda(
  programs: ProgramIds,
  networkId: bigint,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_registry"), u64Le(networkId)],
    programs.oracle,
  );
}

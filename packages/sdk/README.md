# @conexple/sdk

TypeScript helpers for the four Conexple Anchor programs. Used by
`apps/web` (frontend) and `apps/operator` (Workers) to derive PDAs and
type chain reads.

## Exports

```ts
import {
  // PDA derivations
  configPda,
  networkPda,
  positionPda,
  purchasePda,
  merchantPda,
  poolPda,
  pendingPda,
  oracleRegistryPda,
  // Anchor client glue
  buildProvider,
  bindPrograms,
  // Types
  type Position,
  type NetworkState,
  type ProtocolConfig,
  type MerchantEscrow,
  type PoolAccount,
  type PendingCommission,
  type ProgramIds,
  // Constants
  LEVEL_COUNT,
  SPLIT_PARTS,
  MAX_MARGIN_BPS,
  DEFAULT_MULTIPLIER,
  CYCLE_SECONDS,
} from "@conexple/sdk";
```

## Why hand-written types?

Anchor 0.30 generates IDL JSON to `target/idl/<program>.json` after
`anchor build`. The strongly-typed `Program<Conexple>` codegen
requires those JSONs at build time of the consumer. For a hackathon
V1 we ship hand-written types in `src/types.ts` so the frontend builds
without depending on `target/`. Post-hackathon, replace with
`@coral-xyz/anchor`'s codegen.

## Usage

```ts
import { networkPda, positionPda } from "@conexple/sdk/pdas";
import { PublicKey } from "@solana/web3.js";

const programs = {
  protocol: new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_PROTOCOL!),
  network:  new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_NETWORK!),
  escrow:   new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ESCROW!),
  oracle:   new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ORACLE!),
};

const [networkPdaPubkey] = networkPda(programs, 1n);
const [myPosition] = positionPda(programs, 1n, wallet);
```

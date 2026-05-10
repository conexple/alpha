# Merchant integration guide

> Audience: a TypeScript developer with Solana familiarity who wants to plug
> their own wallet into a Conexple network as a merchant.
>
> Status: alpha / hackathon prototype. Devnet only. The on-chain protocol is
> permissionless; the merchant onboarding UX is not. Today, you run a CLI
> script. A self-service `/merchant/onboard` page is sketched but not built.

## 1. Overview

Conexple is an open consumer-affiliate protocol on Solana. Consumers register
into a referral network. When a consumer makes a purchase from a participating
merchant, the protocol splits the merchant's margin between uplines and a
shared social pool. Settlement happens after a hold window (one full cycle —
typically 24h) so merchants retain the right to void on fraud or refunds.

A **merchant** in this model is anyone who:

1. Operates a storefront (web2 or web3).
2. Holds a Solana wallet they control (the merchant authority).
3. Funds an on-chain escrow vault denominated in USDC.
4. Reports purchases through the operator's signed-purchase webhook.

Once a merchant is initialized, the operator can:

- Record purchases that accrue commissions to the consumer's uplines.
- Void purchases inside the hold window if fraud/refund is detected.
- Receive payouts (in production) when accruals settle.

Conexple does NOT custody merchant funds beyond the active commission
pipeline. Anything in the vault that isn't earmarked for a pending
commission is the merchant's to withdraw.

## 2. Prerequisites

| Requirement              | Detail                                              |
|--------------------------|-----------------------------------------------------|
| Devnet wallet            | A Solana keypair you control. ~0.05 SOL is plenty. |
| USDC supply              | In production, real USDC on mainnet. In this demo, the deployer mints mock USDC (legacy SPL token, 6 decimals — see `keys/demo-usdc-mint.json`). |
| Anchor IDL               | `target/idl/conexple_escrow.json` (also mirrored at `packages/sdk/src/idl/conexple_escrow.json`). |
| Node + pnpm              | Node v20 LTS, pnpm 9+, run scripts from the alpha repo root. |
| RPC endpoint             | `https://api.devnet.solana.com` works for low volume. |

To check your balance:

```sh
solana balance <YOUR_PUBKEY> --url https://api.devnet.solana.com
```

To fund a brand-new wallet on devnet:

1. Open https://faucet.solana.com
2. Paste your pubkey
3. Request 0.5 SOL (devnet)

The script will not airdrop for you — devnet faucets reject Cloudflare Worker
IPs and many CI environments.

## 3. Architecture

```
                        ┌───────────────────────┐
                        │  Merchant wallet      │
                        │  (your keypair)       │
                        └──────────┬────────────┘
                                   │ signs
                                   │ initialize_merchant(network_id, merchant_id)
                                   ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                conexple_escrow program                      │
   │                                                             │
   │   creates ──▶  MerchantEscrow PDA                           │
   │               seeds = ["merchant", network_id, merchant_id] │
   │               { merchant: pubkey, vault: pubkey,            │
   │                 deposited_total, paid_out_total, voided }   │
   │                                                             │
   │   owns    ──▶  Vault ATA  (mint = USDC,                     │
   │                            owner = MerchantEscrow PDA)      │
   └─────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ deposit(amount)
                                   │ (merchant signs)
                        ┌──────────┴────────────┐
                        │  Merchant USDC ATA    │
                        └───────────────────────┘
```

Customer purchase flow (off-chain → on-chain):

```
  Consumer ──HTTPS──▶ Storefront ──HMAC──▶ Operator /purchase/ingest
                                                   │
                                                   │ signs as Oracle
                                                   ▼
                                       conexple_oracle::record_purchase
                                                   │
                                                   │ CPI
                                                   ▼
                                       conexple_network::record_purchase
                                                   │
                                                   │ CPI
                                                   ▼
                                       conexple_escrow:: pending_commission rows
                                                   │
                                                   │ after hold window expires
                                                   ▼
                                       conexple_escrow::settle_pending
                                                   │
                                                   ▼
                                       USDC moves: vault → recipient ATA
```

The merchant's job ends at depositing USDC. From there, the protocol moves
funds out of the vault on the operator's settlement schedule.

## 4. Step-by-step CLI walkthrough

The reference implementation is `scripts/init-merchant-byok.ts` (BYOK = Bring
Your Own Key). It mirrors `scripts/init-merchant.ts` but uses a separate
merchant keypair instead of the deployer.

### 4.1 Generate or reuse a merchant keypair

```sh
solana-keygen new --outfile keys/merchant-04.json --no-bip39-passphrase
solana-keygen pubkey keys/merchant-04.json
```

### 4.2 Fund the merchant on devnet

Visit https://faucet.solana.com, paste the pubkey, request 0.5 SOL.

Verify:

```sh
solana balance <YOUR_PUBKEY> --url https://api.devnet.solana.com
```

### 4.3 Run the script

From the alpha repo root:

```sh
MERCHANT_KEY_PATH=keys/merchant-04.json \
MERCHANT_ID=4 \
MERCHANT_NAME="Demo Merchant 04 (BYOK)" \
MARGIN_BPS=2500 \
INITIAL_USDC_DEPOSIT=25000000 \
pnpm exec tsx scripts/init-merchant-byok.ts
```

| Env var                  | Default                          | Notes |
|--------------------------|----------------------------------|-------|
| `MERCHANT_KEY_PATH`      | `keys/merchant-04.json`          | Path to your merchant secret key. |
| `MERCHANT_ID`            | `4`                              | u64 > 0, must not collide with existing merchants 1/2/3. |
| `MERCHANT_NAME`          | `Demo Merchant NN (BYOK)`        | Off-chain label, never written on-chain. |
| `MARGIN_BPS`             | `2500`                           | Off-chain. ≤ 5000 by protocol rule. |
| `INITIAL_USDC_DEPOSIT`   | `25000000`                       | Base units (USDC has 6 decimals); 25_000_000 = 25 USDC. |
| `NETWORK_ID`             | `1`                              | The network you're joining. |
| `SOLANA_RPC_URL`         | `https://api.devnet.solana.com`  | Devnet RPC. |

### 4.4 Expected output

```
──────────────────────────────────────────────────────────
Initializing merchant: Demo Merchant 04 (BYOK)
  network_id          : 1
  merchant_id         : 4
  margin_bps (offch.) : 2500
  initial deposit     : 25000000 base units
  merchant key file   : <abs path>/keys/merchant-04.json
  merchant pubkey     : B678BA7gDhqy3YSWj3jqL1Tf2uJRbAABfhUurZFowPa6
  deployer (mint auth): <deployer pk>
  USDC mint           : <mint pk>
  MerchantEscrow PDA  : <pda>
  Vault (ATA)         : <vault>
  Merchant USDC ATA   : <ata>
──────────────────────────────────────────────────────────
▷ Merchant SOL balance: 0.500000 SOL (500000000 lamports)
▷ initialize_merchant tx: <sig>
  https://solscan.io/tx/<sig>?cluster=devnet
▷ mintTo 25000000 tx: <sig>
  https://solscan.io/tx/<sig>?cluster=devnet
▷ deposit 25000000 tx: <sig>
  https://solscan.io/tx/<sig>?cluster=devnet

✅ Merchant ready.
{
  "networkId": "1",
  "merchantId": "4",
  ...
}

Solscan:
  MerchantEscrow: https://solscan.io/account/<pda>?cluster=devnet
  Vault         : https://solscan.io/account/<vault>?cluster=devnet
  Merchant      : https://solscan.io/account/<merchant>?cluster=devnet
```

The script is idempotent: re-running it with the same `MERCHANT_ID` will skip
the init step. If the vault is empty and `INITIAL_USDC_DEPOSIT > 0`, it will
top up — useful as a "fund my existing merchant" tool.

## 5. Anchor IDL excerpt

Source: `packages/sdk/src/idl/conexple_escrow.json` (also at
`target/idl/conexple_escrow.json`).

### `initialize_merchant`

```jsonc
{
  "name": "initialize_merchant",
  "docs": ["Initialize a merchant escrow + USDC vault PDA."],
  "accounts": [
    {
      "name": "merchant_escrow",
      "writable": true,
      "pda": {
        "seeds": [
          { "kind": "const", "value": [109,101,114,99,104,97,110,116] }, // b"merchant"
          { "kind": "arg",   "path": "network_id" },
          { "kind": "arg",   "path": "merchant_id" }
        ]
      }
    },
    {
      "name": "vault",
      "docs": [
        "Vault token account is created/owned by the merchant_escrow PDA.",
        "Caller is responsible for creating this with merchant_escrow as authority."
      ]
    },
    { "name": "merchant", "writable": true, "signer": true },
    { "name": "system_program", "address": "11111111111111111111111111111111" }
  ],
  "args": [
    { "name": "network_id",  "type": "u64" },
    { "name": "merchant_id", "type": "u64" }
  ]
}
```

Note that the IDL does not auto-create the vault token account — your client
has to create it (with `merchant_escrow` as the authority and
`allowOwnerOffCurve: true` since the PDA is off-curve) **before or in the
same transaction as** `initialize_merchant`.

### `deposit`

```jsonc
{
  "name": "deposit",
  "docs": ["Merchant deposits USDC into their escrow."],
  "accounts": [
    {
      "name": "merchant_escrow",
      "writable": true,
      "pda": { /* same seeds as above, validated against stored network_id/merchant_id */ }
    },
    { "name": "vault",         "writable": true },
    { "name": "merchant_token", "writable": true },
    { "name": "merchant",      "signer": true },
    { "name": "token_program", "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }
  ],
  "args": [
    { "name": "amount", "type": "u64" }
  ]
}
```

`deposit` is a thin wrapper around an SPL Token transfer from `merchant_token`
(your USDC ATA) to `vault` (the PDA-owned vault), with bookkeeping on
`merchant_escrow.deposited_total`. Only the `merchant` signer can deposit
to its own escrow.

### TypeScript snippet

```ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

// 1. Derive PDAs
const [merchantEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("merchant"), u64Le(networkId), u64Le(merchantId)],
  escrowProgramId,
);
const vault = getAssociatedTokenAddressSync(
  usdcMint,
  merchantEscrowPda,
  /* allowOwnerOffCurve */ true,
);

// 2. Build createATA + initialize_merchant in one tx
const createVaultIx = createAssociatedTokenAccountIdempotentInstruction(
  merchant.publicKey, vault, merchantEscrowPda, usdcMint,
);
const initMerchantIx = await escrowProgram.methods
  .initializeMerchant(new anchor.BN(networkId), new anchor.BN(merchantId))
  .accounts({
    merchantEscrow: merchantEscrowPda,
    vault,
    merchant: merchant.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .instruction();

// 3. deposit (separate tx, merchant-only signer)
await escrowProgram.methods
  .deposit(new anchor.BN(amount))
  .accounts({
    merchantEscrow: merchantEscrowPda,
    vault,
    merchantToken: merchantUsdcAta,
    merchant: merchant.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([merchant])
  .rpc();
```

The full reference is `scripts/init-merchant-byok.ts`.

## 6. Production considerations

The hackathon demo cuts corners that production cannot:

- **Real USDC, not mock.** On mainnet, the merchant acquires USDC through the
  usual rails (DEX, fiat onramp, P2P). The deployer's mint authority on
  `keys/demo-usdc-mint.json` does not exist for canonical USDC. The
  `merchant_token` and `vault` accounts must use the canonical USDC mint
  address, and the on-chain program must be deployed with that mint as a
  configured constant or pulled from `ProtocolConfig`.

- **Multi-sig merchant wallets.** A real merchant likely operates a treasury
  multi-sig (Squads, Realms, or hardware-secured). Both `initialize_merchant`
  and `deposit` accept a single signer in V1; in V2, accept any account that
  passes a custom predicate (e.g. multisig-membership check), or unify on
  `Squads SDK` for delegated signing.

- **Hold and refund timing.** The hold window is one full cycle, default
  24h. See `docs/mechanics.md` for the canonical commission/expiry/placement
  spec and `docs/payout.md` for the hold/settlement/program-arch spec. The
  refund cutoff is `block.timestamp < settle_at`; after that, voiding will
  fail and refunds become an off-chain dispute.

- **Oracle attestation for purchases.** In V1, the operator's oracle worker
  signs every `record_purchase` instruction. The merchant's only role in the
  purchase flow is firing an HMAC-signed webhook to the operator. In V2,
  consider a dual-signer model (oracle + merchant) so a malicious operator
  cannot synthesize purchases.

- **Withdrawal.** V1 has no `withdraw` instruction. The merchant cannot
  remove deposited funds beyond what the protocol pays out as commissions.
  V2 must add a guarded withdraw with a cool-down so an attacker cannot
  drain the vault during a void window.

- **Margin caps.** `MARGIN_BPS` is currently off-chain metadata. The on-chain
  enforcement uses `ProtocolConfig.margin_bps_max` (5000 = 50%). Production
  should store per-merchant margin in `MerchantEscrow` and enforce it during
  `record_purchase`, not at the operator layer.

## 7. Future work (V2)

- **`/merchant/onboard` self-service web UI.** Sketched in
  `apps/web/src/app/merchant/` but not implemented. The flow would be:
  1. Connect wallet (Phantom, Solflare, Squads).
  2. Pick `MERCHANT_ID` (auto-suggested by operator).
  3. Sign a `prepareMerchantInit` transaction prepared by the operator
     backend (which validates the id is unique and the user owns the wallet).
  4. Initial deposit via wallet UX, no script required.

- **Per-merchant policy engine.** Activity rules (`ANY` / `THRESHOLD` /
  `SUBSCRIPTION`), refund SLAs, and dispute escalation tiers.

- **Reporting + accounting exports.** CSV/Parquet from D1 to R2, monthly
  P&L summaries scoped to the merchant.

- **Multi-network membership.** A single merchant pubkey participating in
  multiple networks simultaneously (per-`network_id` MerchantEscrow). The
  on-chain program already supports this via the seed schema; only the
  off-chain operator catalog needs to enumerate cross-network presence.

- **Mainnet readiness audit.** This guide does not constitute a security
  review. Do not deploy to mainnet without a third-party audit of all four
  on-chain programs and the operator's oracle key handling.

## 8. Reference: live devnet proof

The Conexple Frontier hackathon submission includes one live MerchantEscrow
created with a non-deployer wallet — proof that the protocol is genuinely
permissionless on the merchant side.

- Merchant pubkey: `B678BA7gDhqy3YSWj3jqL1Tf2uJRbAABfhUurZFowPa6`
- Network ID: `1`
- Merchant ID: `4`
- Margin BPS (off-chain): `2500`
- Initial deposit: `25_000_000` base units (= 25 demo USDC)

**Run timestamp:** 2026-05-10 ~14:00 ICT (devnet)

After airdropping 0.5 SOL to `B678BA7gDhqy3YSWj3jqL1Tf2uJRbAABfhUurZFowPa6` via faucet.solana.com and running:

```bash
MERCHANT_KEY_PATH=keys/merchant-04.json pnpm exec tsx scripts/init-merchant-byok.ts
```

Three on-chain transactions landed (cost: 0.005999 SOL of merchant's own balance for rent + fees):

- `initialize_merchant` tx (signed by **merchant**, not deployer):  
  [`5mBeCRu…JphY`](https://solscan.io/tx/5mBeCRucKoAThAwmw6JuUL4dRh8MCLZ6xEwJJtLjC1ZBM7GM31Fzzqh52TP9rucLWwDcFwCkKAcBv2Gf7B44JphY?cluster=devnet)
- `mintTo 25 USDC` tx (signed by deployer = mock USDC mint authority; in production Circle issues USDC):  
  [`2U7GN99Q…JDM7`](https://solscan.io/tx/2U7GN99QZQGF3uubUThAoDgdV8QKc8JXYLX88NmWwgaSXL87ctbV3DYnm3FZGD8WtYvVjCacg1VCJxVHHpy7JDM7?cluster=devnet)
- `escrow.deposit 25 USDC` tx (signed by **merchant**, sourcing from their own USDC ATA):  
  [`4xrytAYt…bMHw`](https://solscan.io/tx/4xrytAYtqLj8K1vvhLd2gtc1tQk7W2DifgN6zm4pAYka9GPdu8zdQAsYVe4i1SaPwrRA3YdqTZuA5v6HPhjnbMHw?cluster=devnet)

State after the run (verified via `getAccountInfo` + `getTokenAccountBalance`):

- MerchantEscrow PDA: [`EuLxzKuG…Rq6R`](https://solscan.io/account/EuLxzKuGXnVZzSMqXw22b4bZgJbCye6BCu7N9ekHRq6R?cluster=devnet) — 145 B, owner = `9eTvjKrf…` (conexple_escrow program)
- Vault ATA: [`GXG4zHYb…7iES`](https://solscan.io/account/GXG4zHYbWzK5FSuyjNeTLh4Cx8Fb3gkWW5hxvnJR7iES?cluster=devnet) — 165 B, balance **25 USDC**
- Merchant USDC ATA: `4E5GnvYbVWBxu7RgirvcA3WWFtajgSyPca22BNJKz31W` — drained from 25 → 0 (deposited)
- Merchant SOL: 0.5 → 0.494001 (paid 0.005999 for fees + 2 ATA rents + PDA rent)

A full machine-readable receipt is at `submission/byok-merchant-04-receipt.json`. This receipt is the canonical Side 3 proof — a non-deployer Solana wallet successfully created and funded their own MerchantEscrow on Conexple's devnet network.

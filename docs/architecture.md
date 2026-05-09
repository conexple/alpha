# Architecture

> Cleaned-up English version of the architecture spec. Authoritative
> spec lives in `../instruction/work/plan.md` and the prep folder's
> `docs/05-architecture.md`.

## On-chain / off-chain split

```
                            Solana devnet
   ┌────────────────┐     ┌──────────────────┐
   │ conexple_      │     │ conexple_        │  Position state — single
   │ protocol       │ ←──CPI│ network        │  source of truth.
   │  rules + verify│     │  Position, expiry│  Other programs CPI here.
   └────────────────┘     └──────┬───────────┘
                                 │ CPI
   ┌────────────────┐     ┌──────▼───────────┐  ┌─────────────────┐
   │ conexple_      │ ──→ │ conexple_        │  │ Mock USDC       │
   │ oracle         │     │ escrow           │──│ (SPL token)     │
   │  registry      │     │  payouts + pool  │  └─────────────────┘
   │  signed log    │     └──────────────────┘
   └─────▲──────────┘
         │ signed instructions
   ┌─────┴────────────────────────────────────────┐
   │ Cloudflare Workers (apps/operator)           │
   │  oracle | placement | scheduler |            │
   │  purchase-ingest | rpc-cache | merchant      │
   │  + D1 (mirror + idempotency) + KV (RPC cache)│
   │  + Queues + Cron Trigger 0 23 * * *          │
   └──────────────────────────────────────────────┘
                      ▲
                      │ HTTPS
   ┌──────────────────┴──────────────────────┐
   │ Cloudflare Pages (apps/web)             │
   │  Next.js 15 App Router + Tailwind +     │
   │  Solana wallet adapter (Phantom)        │
   │  consumer · operator · merchant · public│
   └─────────────────────────────────────────┘
```

## Why this split

**On-chain has the truth.** Every state transition that anyone could
dispute (placement, accrual, payout, expiry) settles on-chain.

**Cloudflare has the speed.** Placement decisions, scheduling, ancestor
traversal — these are computation, not state. Doing them off-chain
costs ~$0/month at hackathon scale.

**The oracle is replaceable.** `conexple_oracle::register_oracle` is a
governance entry point. If the oracle misbehaves, the protocol can
swap it without redeploying network or escrow.

## On-chain accounts (PDAs)

| PDA | Owner | What |
|---|---|---|
| `ProtocolConfig` | conexple_protocol | rules: margin cap, cycle, multiplier, pool split |
| `NetworkState` | conexple_network | per-network root: cycle index, oracle pubkey, member count |
| `Position` | conexple_network | per-(network,wallet) — parent, depth, status, earnings |
| `PurchaseRecord` | conexple_network | per-(wallet,round) — total amount + count |
| `MerchantEscrow` | conexple_escrow | per-merchant USDC vault |
| `PoolAccount` | conexple_escrow | per-network social + operator pool balances |
| `PendingCommission` | conexple_escrow | per-(purchase,kind,slot) — pre-settlement state |
| `OracleRegistry` | conexple_oracle | authorized signer set |

## Off-chain components

### Placement engine
Cloudflare Worker. Reads the D1 mirror of Position state, walks
depth-first under the referrer, returns the first valid slot.
Idempotent on `(referrer, new_wallet)`.

### Cycle scheduler
Cloudflare Worker on a Cron Trigger (`0 23 * * *`).
Queries `pending_commission` rows with `settle_at <= now AND status =
'pending'`, re-checks Position.status on-chain (Rule 1 — see
`payout.md`), submits one `settle_pending` per row.

### Oracle worker
Holds the oracle keypair as a Cloudflare Secret. Signs and submits
instructions on behalf of the other workers. Logs every signature to
`oracle_audit` (D1).

### RPC cache
Reverse-proxy for Solana RPC reads. Caches `getAccountInfo`,
`getMultipleAccounts`, `getProgramAccounts` for ~5s in KV. Saves the
Helius free tier from refresh storms during demo.

### Purchase ingest
HMAC-verified webhook from the demo storefront. Pushes to a Queue;
the Queue consumer creates `pending_commission` rows.

### Merchant ops
`/merchant/void` and `/merchant/force-expire`. V1: D1-only stubs;
production: also CPI the corresponding on-chain instructions.

## Data flow: a purchase to a payout

```
1.  Customer F buys 1,000 from merchant on demo storefront
        ↓
2.  Storefront webhook → Cloudflare Queue "purchase"
        ↓
3.  Worker consumes queue → calls record_purchase on chain via oracle
                        → inserts into D1.purchases
                        → for each upline level (1..5): inserts pending_commission row
                          with anchor_at = block_time, settle_at = block_time + 30d
        ↓
4.  At cycle cut-off (daily 23:00 UTC), scheduler:
       SELECT * FROM pending_commission WHERE settle_at <= now AND status = 'pending'
        ↓
5.  Scheduler checks Position.status for each recipient on-chain (Rule 1)
        ↓
6.  Scheduler builds settle_pending instruction(s):
       [ (E, 71.43), (A, 71.43), pool=357.14, override=null ]
        ↓
7.  Oracle worker signs + submits → on-chain payout
        ↓
8.  conexple_escrow transfers USDC from MerchantEscrow → recipient ATAs
        ↓
9.  D1 updates settlements + pending_commission status = 'settled'
        ↓
10. Frontend reads from chain (or RPC cache) → user sees new balance
```

## Versioning

V1 (this hackathon snapshot):
- 4 Anchor programs deployed to **devnet** only
- Mock USDC SPL Token (legacy program — not Token-2022)
- D1 idempotency instead of Durable Objects (Workers Free plan)
- Single network, single operator (Conexple Thailand)

V2 (post-hackathon):
- Mainnet deployment with real USDC mint
- Token-2022 support
- Durable Objects for atomic placement + settlement
- Operator registration on-chain — anyone can deploy a network
- Per-merchant activity rules (ANY / THRESHOLD / SUBSCRIPTION)

V3 (foundation):
- DAO governance for protocol parameters
- Multi-operator marketplace
- Cross-network commissions

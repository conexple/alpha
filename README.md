# Conexple

> Open-source consumer affiliate protocol on Solana — redirect existing
> merchant marketing commissions to everyday consumers, not influencers.

**Status:** v0.1 alpha — hackathon prototype.
Deployed to **Solana devnet only.** Smart contracts are unaudited.
Do not use with real funds.

- **Live demo:** [alpha.conexple.com](https://alpha.conexple.com) (Cloudflare Workers — static assets)
- **Operator backend:** [conexple-worker-operator.sornwin.workers.dev](https://conexple-worker-operator.sornwin.workers.dev) (Cloudflare Workers — `/health`, `/settle/run`, `/webhook/purchase`, etc.)
- **Solscan-verifiable example tx:** [3voysBj...A5Q6t](https://solscan.io/tx/3voysBjypcH3qNCusJ1g66BywVMSmojNQbWuqkpDcTtbXunGWbD3euQezntd5KY2A1N4VHku2omPyM2vjgMA5Q6t?cluster=devnet) (record_purchase by wallet E, amount=1000)
- **6 merchants on chain** — 3 deployer-signed (id 1–3) plus 3 BYOK merchants (id 4, 5, 6) initialized by independent keypairs that signed their own `initialize_merchant` instruction. See `submission/byok-merchant-04-receipt.json` + `submission/settle-receipt.json` for traceable proof.
- **Multi-cycle settlement proof** — recent on-chain `add_earnings` transactions distributing commission across upline:
  - [`aMnXq4v4…n2S`](https://solscan.io/tx/aMnXq4v4YJsvUXYYq4S1jbrXs3MStjVcRq7ZYej77XWQdY9LDUSDa8W5S4V3m6rkbWUyj7DNoyh5AdgQrWR1n2S?cluster=devnet) — customer K → 4 upline × 571 base units (merchant 04 BYOK proof)
  - [`3cVWq6SA…aZZf`](https://solscan.io/tx/3cVWq6SANKw44Qbcpc9TXb5f5pvudiCKoJsPZ1HnFw3XAmp5G6JtLgZvMG73t6NcGKR1KSFoH3ztmNNNoEzbaZZf?cluster=devnet) — customer of merchant 05 → 5 upline × 285 base units
  - [`PfPdB7mn…vJ3`](https://solscan.io/tx/PfPdB7mnDo4cQeS1oi7JTivKYmmfFAb41sgq8VPTdXmc77ocgKkfMEduH8XF4hCHzNWXAmQHR2oYYVcrwmXGvJ3?cluster=devnet) — customer of merchant 06 → 3 upline × 428 base units
  - [`2c1ND1Bx…DS56`](https://solscan.io/tx/2c1ND1BxxJ9seiePE1V7waLwnJkLc1NW33UNVNRixxja3rCpmywEDr7Yu6RWj3voGBzEPRcZDsdy8Yd3aL3cDS56?cluster=devnet) — second customer of merchant 05 → 5 upline × 214 base units
- **On-chain escrow security upgrade (2026-05-11)** — closed 4 Anchor authorization gaps in `conexple_escrow` (recipient-token binding, network-oracle auth, cross-merchant pending binding). Upgrade tx: [`3m6H4ryM…XcUd`](https://solscan.io/tx/3m6H4ryM9onKGyAivoRxQytfkucguDPx3vjUKowzs9uSgFeMUbtKS2fggWVUzgyxSQ1nmQbqRiqnxudSJC3UXcUd?cluster=devnet). See [SECURITY.md](./SECURITY.md) §"Pre-submission audit".
- **Program IDs (Solana devnet):**
  - `conexple_protocol` — [`D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn`](https://solscan.io/account/D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn?cluster=devnet)
  - `conexple_network` — [`9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9`](https://solscan.io/account/9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9?cluster=devnet)
  - `conexple_escrow` — [`9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU`](https://solscan.io/account/9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU?cluster=devnet)
  - `conexple_oracle` — [`9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz`](https://solscan.io/account/9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz?cluster=devnet)
- **Demo USDC mint (devnet, mock):** [`DMVSU4BNqqLSmQeo5wop3SnUsA3xkoEvJAqNHe2e1rNG`](https://solscan.io/account/DMVSU4BNqqLSmQeo5wop3SnUsA3xkoEvJAqNHe2e1rNG?cluster=devnet)
- **Pitch video (≤ 3 min):** [youtu.be/ToolLDP2AIw](https://youtu.be/ToolLDP2AIw)
- **Technical demo (2–3 min):** [youtu.be/XSwwHwVHtBw](https://youtu.be/XSwwHwVHtBw)
- **Pitch deck (PDF):** `submission/pitch-deck.pdf` *(build from `pitch-deck-outline.md`)*
- **License:** [Apache 2.0](./LICENSE) · permissive, patent grant, fork-friendly

## Why consumers should be paid

Affiliate budgets exist. Today they flow to influencers and broadcasters who
are paid for *reach*, not for *purchases*. Conexple redistributes that same
budget to the people who actually buy: 5 levels of upline consumers and a
public social pool, all enforced on chain.

Long-term, the goal is bigger than affiliate fairness. We're building toward
a *basic-income economy from consumption* — where the act of buying itself
produces income for a network of real customers, not a handful of
permanent influencers.

Positions expire by design — on inactivity or once a wallet has earned
back its own spend × multiplier. The high-yield seats don't stay with the
same wallets forever, and re-entry is open to anyone who buys again.
No permanent residents. The cycle is the economy.

## What is Conexple

Merchants on platforms like Shopee and Lazada already pay substantial
affiliate commissions. Today, that pool concentrates on professional
influencers. Conexple is a Solana protocol that splits the same pool
across up to 5 levels of upline consumers — turning loyal customers
into participants in the marketing economy without adding new cost to
the merchant.

Every rule and every payout is on-chain and publicly verifiable.

## Why this is not MLM

| MLM concern | Conexple structural answer |
|---|---|
| Hidden rules | All rules in `programs/conexple-protocol`, on-chain |
| Pay-to-join | No fees, no inventory, no membership |
| Recruitment-driven income | Commission depends on **purchases**, not recruiting |
| Endless tiers | 5 levels max for direct commission split |
| Pyramid economics | 50% margin cap enforced on-chain |
| Operator runs with the money | USDC sits in `conexple-escrow`; payouts protocol-enforced |

## Architecture at a glance

```
┌──────────────────┐    ┌──────────────────┐
│ Solana programs  │←CPI│ conexple_network │  Single source of truth
│ (Anchor):        │    │  (Position state)│  for the network state.
│  • protocol      │    └──────────────────┘
│  • network       │
│  • escrow        │    ┌──────────────────┐
│  • oracle        │←───│ Cloudflare       │  Off-chain placement,
└──────────────────┘    │ Workers + D1 +   │  scheduling, oracle
        ▲               │ Durable Objects  │  signing, RPC cache.
        │               └──────────────────┘
        │
   ┌────┴───────────────┐
   │ Next.js on         │  Consumer + operator + merchant + public
   │ Cloudflare Worker  │  explorer views (static export).
   └────────────────────┘
```

Detailed: [docs/architecture.md](./docs/architecture.md).

## Quickstart

```bash
# 1. Clone + install
git clone https://github.com/conexple/alpha
cd conexple
pnpm install

# 2. Local Solana toolchain (WSL Ubuntu recommended on Windows)
solana-keygen new --no-bip39-passphrase -o keys/devnet-deployer.json
solana config set --url devnet --keypair keys/devnet-deployer.json
solana airdrop 5

# 3. Build + deploy programs (one-shot, idempotent)
bash scripts/deploy-devnet.sh

# 4. Seed demo data (1 merchant + 5 wallets + 3-level network)
pnpm seed

# 5. Verify on-chain (writes Solscan link to submission/smoke-receipt.json)
pnpm smoke

# 6. Run frontend + operator locally
pnpm --filter web dev          # http://localhost:3000
pnpm --filter operator dev     # http://localhost:8787 (wrangler dev)
```

For architecture deep-dive see [`docs/architecture.md`](./docs/architecture.md);
for protocol mechanics see [`docs/mechanics.md`](./docs/mechanics.md).

## Repo layout

```
programs/                    Anchor programs (the open protocol)
  conexple-protocol/         rules + verify_placement
  conexple-network/          Position state, register/place/extend/expire
  conexple-escrow/           merchant USDC vaults + payouts + pool
  conexple-oracle/           registered backend signers + audit log

apps/
  web/                       Next.js 15 frontend (Cloudflare Workers — static assets)
  operator/                  Cloudflare Workers backend (Hono + D1 + KV + Queue)

packages/sdk/                shared TypeScript types + PDA helpers

scripts/                     deploy-devnet · init-network · mint-demo-usdc · seed-demo · e2e-smoke
tests/                       Anchor end-to-end happy-path test
submission/                  pitch script · tech demo script · deck outline · receipts
```

Detailed reading order: [`docs/architecture.md`](./docs/architecture.md) → [`docs/mechanics.md`](./docs/mechanics.md) → [`docs/payout.md`](./docs/payout.md).

## Contributing

This is an open protocol — anyone can fork it and deploy a network for
their own use case. For changes to this implementation, open an issue
first to discuss; PRs welcome on `main`.

## Security

See [SECURITY.md](./SECURITY.md). Smart contracts are unaudited;
independent review is welcomed.

## License

[Apache 2.0](./LICENSE) — patent grant included, business-friendly.

## Acknowledgements

- Solana Foundation, Anchor maintainers
- Colosseum Frontier 2026 hackathon
- Inspired by GDI Infinity Override; redesigned for an affiliate-only
  (no recruitment) model

— Conexple contributors · Built in Bangkok, Thailand 🇹🇭

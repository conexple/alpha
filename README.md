# Conexple

> Open-source consumer affiliate protocol on Solana — redirect existing
> merchant marketing commissions to everyday consumers, not influencers.

**Status:** v0.1 alpha — hackathon prototype.
Deployed to **Solana devnet only.** Smart contracts are unaudited.
Do not use with real funds.

- **Live demo:** [conexple-pages-web.pages.dev](https://conexple-pages-web.pages.dev) (Cloudflare Pages)
- **Operator backend:** [conexple-worker-operator.sornwin.workers.dev](https://conexple-worker-operator.sornwin.workers.dev) (Cloudflare Workers — `/health`, `/settle/run`, `/webhook/purchase`, etc.)
- **Solscan-verifiable example tx:** [3voysBj...A5Q6t](https://solscan.io/tx/3voysBjypcH3qNCusJ1g66BywVMSmojNQbWuqkpDcTtbXunGWbD3euQezntd5KY2A1N4VHku2omPyM2vjgMA5Q6t?cluster=devnet) (record_purchase by wallet E, amount=1000)
- **Program IDs (Solana devnet):**
  - `conexple_protocol` — [`D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn`](https://solscan.io/account/D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn?cluster=devnet)
  - `conexple_network` — [`9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9`](https://solscan.io/account/9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9?cluster=devnet)
  - `conexple_escrow` — [`9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU`](https://solscan.io/account/9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU?cluster=devnet)
  - `conexple_oracle` — [`9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz`](https://solscan.io/account/9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz?cluster=devnet)
- **Demo USDC mint (devnet, mock):** [`DMVSU4BNqqLSmQeo5wop3SnUsA3xkoEvJAqNHe2e1rNG`](https://solscan.io/account/DMVSU4BNqqLSmQeo5wop3SnUsA3xkoEvJAqNHe2e1rNG?cluster=devnet)
- **Pitch video (≤ 3 min):** https://youtu.be/... *(set after upload — script in `submission/pitch-script.md`)*
- **Technical demo (2–3 min):** https://youtu.be/... *(set after upload — script in `submission/tech-demo-script.md`)*
- **Pitch deck (PDF):** `submission/pitch-deck.pdf` *(build from `pitch-deck-outline.md`)*
- **License:** [Apache 2.0](./LICENSE) · permissive, patent grant, fork-friendly

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
   │ Cloudflare Pages   │  explorer views.
   └────────────────────┘
```

Detailed: [docs/architecture.md](./docs/architecture.md).

## Quickstart

```bash
# 1. Clone + install
git clone https://github.com/conexple/conexple
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

For full handoff (videos, deck, Cloudflare deploy, Colosseum submission),
see [`submission/HANDOFF.md`](./submission/HANDOFF.md).

## Repo layout

```
programs/                    Anchor programs (the open protocol)
  conexple-protocol/         rules + verify_placement
  conexple-network/          Position state, register/place/extend/expire
  conexple-escrow/           merchant USDC vaults + payouts + pool
  conexple-oracle/           registered backend signers + audit log

apps/
  web/                       Next.js 15 frontend (Cloudflare Pages)
  operator/                  Cloudflare Workers backend (Hono + D1 + KV + Queue)

packages/sdk/                shared TypeScript types + PDA helpers

scripts/                     deploy-devnet · init-network · mint-demo-usdc · seed-demo · e2e-smoke
tests/                       Anchor end-to-end happy-path test
submission/                  pitch script · tech demo script · deck outline · HANDOFF
```

Detailed reading order: `instruction/work/plan.md` → `submission/HANDOFF.md`.

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

— บริษัท สอนกาน จำกัด (Sornkan Co., Ltd.), Thailand 🇹🇭

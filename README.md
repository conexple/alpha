# Conexple

> Open-source consumer affiliate protocol on Solana — redirect existing
> merchant marketing commissions to everyday consumers, not influencers.

**Status:** v0.1 alpha — hackathon prototype.
Deployed to **Solana devnet only.** Smart contracts are unaudited.
Do not use with real funds.

- **Live demo:** https://conexple.pages.dev *(set after Pages deploy)*
- **Pitch video:** https://youtu.be/... *(set after upload)*
- **Docs:** [docs/](./docs/)
- **License:** [Apache 2.0](./LICENSE)

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

# 2. Local Solana
solana config set --url devnet
solana-keygen new -o ~/.config/solana/devnet-deployer.json
solana airdrop 5 --url devnet

# 3. Build + deploy programs
anchor build
anchor deploy --provider.cluster devnet
./scripts/deploy-devnet.sh

# 4. Seed demo data
pnpm tsx scripts/seed-demo.ts

# 5. Run frontend locally
pnpm --filter web dev   # http://localhost:3000

# 6. Run operator backend locally
pnpm --filter operator dev   # wrangler dev on http://localhost:8787
```

For deployment to Cloudflare Pages and Workers, see
[apps/web/README.md](./apps/web/README.md) and
[apps/operator/README.md](./apps/operator/README.md).

## Repo layout

```
programs/      Anchor programs (the open protocol)
apps/web/      Next.js consumer + operator frontend (Cloudflare Pages)
apps/operator/ Cloudflare Workers backend
packages/sdk/  TypeScript clients for the programs
scripts/       Deploy + seed + smoke
docs/          Mechanics, payout, architecture
```

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

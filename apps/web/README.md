# apps/web — Conexple frontend

Next.js 15 (App Router) + Tailwind + Solana wallet adapter (Phantom).
Deploys to **Cloudflare Pages**.

## Routes

| Path | What |
|---|---|
| `/` | Landing — pitch, mechanics diagram, simulator link |
| `/dashboard` | Connected wallet's position, earnings, cap progress |
| `/explorer` | Read-only network tree (all positions in this network) |
| `/operator` | Operator-side: cycle status, manual settlement run |
| `/merchant` | Merchant-side: void purchase, force-expire position |
| `/simulator.html` | The HTML simulator copied from `reference/` for live demo |

## Local dev

```bash
cd apps/web
cp .env.example .env.local
# fill in NEXT_PUBLIC_PROGRAM_* after `anchor deploy` + `anchor keys list`
pnpm dev   # http://localhost:3000
```

## Deploy

After programs are deployed and operator backend is live:

```bash
# from alpha/ root:
pnpm --filter web build
pnpm --filter web exec wrangler pages deploy .next \
  --project-name conexple-pages-web \
  --branch main
```

Or use the Cloudflare dashboard's git integration on the
`conexple/conexple` repo — it will auto-detect Next.js and run
`pnpm --filter web build`.

## Environment variables

| Name | Where set |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Pages env vars; defaults to `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_OPERATOR_URL` | Pages env vars; the deployed Workers URL |
| `NEXT_PUBLIC_NETWORK_ID` | typically `1` |
| `NEXT_PUBLIC_PROGRAM_PROTOCOL` | from `anchor keys list` |
| `NEXT_PUBLIC_PROGRAM_NETWORK` | from `anchor keys list` |
| `NEXT_PUBLIC_PROGRAM_ESCROW` | from `anchor keys list` |
| `NEXT_PUBLIC_PROGRAM_ORACLE` | from `anchor keys list` |
| `NEXT_PUBLIC_DEMO_USDC_MINT` | from `mint-demo-usdc.ts` output |

All `NEXT_PUBLIC_*` end up in the client bundle, so don't put secrets
here. The operator URL is intentionally public — it's the public RPC
proxy + scheduler entry point.

## What is intentionally minimal

- One wallet adapter (Phantom). Solflare/Backpack would add 30 minutes
  for marginal demo benefit.
- Manual chain decoding in `lib/program-clients.ts` instead of full
  Anchor type generation. Replace with `Program<Conexple>` once
  `target/idl/` is bundled into `packages/sdk/`.
- No SSR for chain reads — everything in `dashboard`/`explorer` is
  `"use client"` and fetches from the browser.

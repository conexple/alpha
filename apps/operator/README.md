# apps/operator — Cloudflare Workers backend

Hono router + D1 + KV + Queue + Cron Trigger.
Plays the role of the off-chain operator described in
`docs/05-architecture.md`.

## Routes

| Method · Path | What |
|---|---|
| `GET /health` | service heartbeat (no auth) |
| `POST /placement/decide` | depth-first placement decision under a referrer |
| `POST /webhook/purchase` | HMAC-signed purchase webhook → Queue |
| `POST /settle/run` | manual settlement run (also runs daily on Cron) |
| `GET /settle/status` | recent settlement runs |
| `POST /oracle/sign` | sign a base64 transaction with the oracle key |
| `POST /oracle/sign-submit` | sign + send + confirm |
| `POST /merchant/void` | void a pending purchase (V1: D1 stub) |
| `POST /merchant/force-expire` | mark a position expired (V1: D1 stub) |
| `POST /rpc` | JSON-RPC proxy with KV cache for `getAccountInfo` etc. |

## Triggers

- `crons = ["0 23 * * *"]` — daily settlement run at 23:00 UTC
- Queue consumer for `conexple-queue-purchase-events` — batched purchase
  ingest

## Local dev

```bash
cd apps/operator
pnpm db:apply:local      # apply Drizzle migrations to local D1 emulator
pnpm dev                 # http://localhost:8787
```

In another terminal:

```bash
curl http://localhost:8787/health
```

## Deploy

```bash
cd apps/operator

# 1. Apply remote D1 migrations
pnpm db:apply:remote

# 2. Set secrets (one-time)
echo "<base58 oracle keypair>" | wrangler secret put ORACLE_SECRET
echo "https://devnet.helius-rpc.com/?api-key=YOUR_KEY" | wrangler secret put HELIUS_RPC_URL
openssl rand -hex 32 | wrangler secret put PURCHASE_WEBHOOK_HMAC

# 3. Deploy
pnpm deploy
```

The deployed Worker URL is what `apps/web` and the demo storefront
point at via `NEXT_PUBLIC_OPERATOR_URL`.

## Why D1 idempotency instead of Durable Objects (V1)

Durable Objects require the Workers Paid plan ($5/mo). For a 2-day
hackathon demo, judging traffic is small enough that D1 unique
constraints + transactional updates give the ordering guarantees we
need (placement queue, settlement run cycle).

If the operator backend gets serious traffic, switch to:

- `PlacementQueue` Durable Object — atomic per-referrer placement
- `SettlementRound` Durable Object — atomic per-cycle state machine

The schemas and route shapes are designed to make that swap purely
internal — frontend contract doesn't change.

## Drizzle schema

`src/db/schema.ts` — networks, positions (mirror), merchants, purchases,
pending_commission, settlements, oracle_audit, idempotency.

To regenerate migrations after schema edits:

```bash
CF_ACCOUNT_ID=... CF_API_TOKEN=... D1_DATABASE_ID=... pnpm db:generate
```

## Audit

Every oracle signature lands in the `oracle_audit` table with a
timestamp + the calling worker's name. Useful for post-incident
forensics.

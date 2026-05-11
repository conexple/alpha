# Security Policy

## Status

Conexple is a **hackathon prototype** at v0.1 alpha. Smart contracts are
**unaudited** and deployed only to **Solana devnet**. Do not deploy to
mainnet or use with real funds.

## Reporting a vulnerability

If you find a security issue in the Anchor programs or the operator
backend, **please do not file a public GitHub issue.** Email instead:

- **Contact:** suanwin.paows@gmail.com
- **PGP:** *(add fingerprint after generating an ops PGP key)*

We acknowledge receipt within 72 hours and aim to respond with an
assessment within one week. Reporters who follow this process are
acknowledged in the project changelog (with permission).

## Scope

In scope:
- The four Anchor programs in `programs/` at their published program IDs
- The operator Worker code in `apps/operator/`
- The frontend code in `apps/web/`
- Any deployed Cloudflare endpoint linked from this repo

Out of scope:
- Third-party dependencies (file with the upstream project)
- The demo storefront seed integration (it's fabricated, not a real shop)
- Rate-limit evasion against free-tier RPC quotas
- Theoretical attacks against an audit that does not yet exist

## Disclosure timeline

Because this is a hackathon prototype, a coordinated 90-day window is
not realistic. We aim for:

- Critical (drainable funds, ability to bypass placement rules):
  patch + disclose within 14 days
- High (incorrect commission accrual, ability to expire someone else's
  position): patch + disclose within 30 days
- Medium / low: best effort, typically within the next minor release

## What is not a vulnerability

- Devnet RPC being slow or unavailable
- Phantom wallet refusing to connect on a non-https URL
- Demo seed wallets being publicly known (they are deterministic by design)

## Pre-submission audit (2026-05-11)

A whole-app security pass was run before submission. Findings + fixes:

- **Fixed:** `/oracle/sign` and `/oracle/sign-submit` were exposed to the
  public internet with no auth — anyone could request the operator's
  oracle key sign an arbitrary instruction. These endpoints had no
  internal callers (in-process `loadOracleKeypair` is used instead), so
  both now return HTTP 410 Gone. See `apps/operator/src/workers/oracle.ts`.
- **Fixed:** `/settle/record` accepted unauthenticated POSTs, allowing
  injection of forged settlement audit rows. Now requires HMAC of body
  in `x-conexple-internal` header (same `PURCHASE_WEBHOOK_HMAC` secret
  as `/webhook/purchase`). `scripts/settle-onchain.ts` updated to send
  the header.
- **Fixed (follow-up pass):** `/settle/run`, `/merchant/void`, and
  `/merchant/force-expire` now also enforce HMAC via the shared
  `requireAdminAuth` helper. A V1 demo bypass remains controlled by the
  `OPERATOR_DEMO_MODE` env var (currently `"true"` for hackathon
  judging); production deploys remove the var to enforce auth on every
  mutating call. Bodies that fail JSON parsing now return 400 (S-3).
  Error responses no longer echo upstream RPC text (S-2). CORS is
  restricted to an explicit origin allowlist (S-5).
- **Fixed (Anchor escrow C-1..C-4):** `programs/conexple-escrow` now
  enforces, on chain:
  - `recipient_token.owner == pending.recipient` in `settle_pending`
    (C-1 — was unconstrained, a vault-drain vector on mainnet)
  - `oracle_authority == network.oracle` (read from the network state
    PDA via cross-program seed check) in `create_pending` and
    `settle_pending` (C-2 — previously trusted the merchant as oracle)
  - `pending.merchant_id == merchant_escrow.merchant_id` in both
    `void_purchase` and `settle_pending` (C-3 — prevents cross-merchant
    griefing of pending rows)
  - The tautological `merchant == merchant_escrow.merchant ||
    merchant == merchant_escrow.merchant` check in `void_purchase` is
    collapsed to a single `require_keys_eq!`; the never-wired admin
    branch is deferred to V2 (C-4).
  Deployed to devnet on 2026-05-11; new program data length 299032
  bytes (was 286568). Tx signature
  `3m6H4ryM9onKGyAivoRxQytfkucguDPx3vjUKowzs9uSgFeMUbtKS2fggWVUzgyxSQ1nmQbqRiqnxudSJC3UXcUd`.
- **Verified:** No private keys, API keys, or seed phrases ever
  committed; HMAC verification is constant-time; all D1 queries are
  parameterized; frontend bundle contains no backend secrets.

## What is explicitly not promised

- Audit. There is none — the pre-submission pass above was internal
  hygiene, not an external security audit.
- Production support. There isn't any.
- A bug bounty. We do not offer one for the hackathon prototype.

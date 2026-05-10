# Technical demo video script — 2–3 minutes

> Audience: technical members of the Colosseum panel + judges
> verifying that the system actually works.
>
> Goal: show the architecture briefly, then prove with a live demo
> that we have working on-chain primitives. The pitch is in the
> separate ≤ 3 min pitch video.

## Visual structure

- Screen recording, no face cam.
- Browser + a terminal side-by-side. Optional: an architecture
  diagram for the first 30 seconds.

## Storyboard (target run-time 2:30)

### 0:00–0:25 — Architecture overview (diagram on screen)

**Show the architecture diagram from `apps/web/public/simulator.html`
or `README.md`.**

VO:
> "Conexple has four Anchor programs deployed to Solana devnet:
> protocol — the rules, network — Position state, escrow — USDC
> vaults and payouts, and oracle — the registered backend signer.
>
> Off-chain, a Cloudflare Worker holds the operator backend: a
> Hono router, a D1 database mirror of position state, a KV-backed
> RPC cache, a Queue for purchase ingest, and a Cron Trigger for
> the daily settlement run.
>
> The frontend is a Next.js app on Cloudflare Pages."

### 0:25–0:55 — The home page + simulator (browser)

**Open the deployed Pages URL.**

VO:
> "Landing page lays out the pitch in 30 seconds. The diagram on
> the right shows the seven-way split.
>
> The simulator — pulled directly from our pre-build prototype — lets
> any judge play with the math. No wallet required."

**Hover the simulator briefly to show interaction.**

### 0:55–1:30 — Connect wallet → see your position (browser)

**Click "Connect → see your position".**

VO:
> "Connecting Phantom on devnet. The site reads `Position` accounts
> directly from chain via a Cloudflare Worker RPC cache.
>
> If the connected wallet is one of the demo wallets — A, B, C, D, E
> — it sees its position, depth, status, cap progress.
>
> Otherwise it gets a friendly "no position yet" panel with a referral
> CTA."

### 1:30–2:00 — Trigger a purchase (terminal)

**Switch to terminal.**

```bash
PURCHASER=E AMOUNT=1000 pnpm smoke
```

VO:
> "We trigger a purchase on devnet for wallet E — the deepest leaf in
> the seeded network. The script signs `record_purchase` via the
> oracle key and submits it.
>
> Output: a transaction signature. Let's open it on Solscan."

**Click the Solscan link.**

VO:
> "Confirmed. You can see the program ID, the PurchaseRecord PDA, the
> log entries from the program. Anyone can verify this trace —
> that's the whole point."

### 2:00–2:25 — Operator dashboard + cycle scheduler

**Switch back to the browser. Open `/operator`.**

VO:
> "The operator dashboard shows recent settlement runs. Hit "Trigger
> cycle now" — the Cloudflare Worker queries pending commissions in
> D1, builds the settlement instructions, and submits them.
>
> In production this runs on a daily Cron Trigger. We're hitting the
> manual button just so you can see it run live."

### 2:25–2:30 — Outro

VO:
> "Code is at github.com/conexple/alpha. Repo is Apache 2.0,
> contracts are unaudited — this is alpha. Pitch video covers the
> business side. Thanks for watching."

## Things you must show on screen at least once

- [ ] The deployed Pages URL in the browser address bar
- [ ] One Solscan transaction page, fully loaded, with our program ID visible
- [ ] The terminal output of `pnpm smoke` with `Confirmed` and the
      tx signature
- [ ] The repo URL on GitHub
- [ ] At least one moment showing wallet-connected state (so judges
      know the wallet adapter actually works)

## What NOT to do

- Don't read the slides verbatim if you also include them.
- Don't try to explain the entire ÷7 split mechanism here — that's
  in the pitch video, and the simulator does it visually.
- Don't show your wallet seed or any keypair JSON.
- Don't apologize for the alpha/devnet status — say it once, move on.

# Handoff — what's built, what's left for the human

> Author: agent build, 2026-05-09
> Reader: Bosso (founder, sole human in the loop)
> Purpose: tell you exactly what state the repo is in, what runs, what
> doesn't yet, and what only you can do (record videos, sign in to
> Colosseum, click submit).

## At-a-glance status (2026-05-09 end-of-session)

| Layer | What | Where | Status |
|---|---|---|---|
| Anchor programs | conexple_protocol, _network, _escrow, _oracle | `programs/` | source ✓ committed; **anchor build/deploy pending toolchain install** |
| Anchor tests | end-to-end happy path (3-level network + purchase) | `tests/full-flow.ts` | source ✓; runs after `anchor build` |
| Operator backend | Hono + D1 + KV + Queue + Cron + Queue consumer, 6 workers | `apps/operator/` | ✅ **LIVE** at https://conexple-worker-operator.sornwin.workers.dev |
| Web frontend | Next.js 15 + Tailwind + Phantom adapter, 5 routes (static export) | `apps/web/` | ✅ **LIVE** at https://conexple-pages-web.pages.dev |
| SDK | PDA helpers + types + Anchor program glue | `packages/sdk/` | source ✓ + typecheck ✓ |
| Scripts | deploy-devnet.sh, init-network.ts, mint-demo-usdc.ts, seed-demo.ts, e2e-smoke.ts, demo-purchases.ts | `scripts/` | source ✓; **run after anchor deploy** |
| Cloudflare resources | D1 (`conexple-d1-operator`), KV (`conexple-kv-rpc-cache`), Queue (`conexple-queue-purchase-events`) | account `SORNKan Co., Ltd.` (a24ce30…) | ✅ **provisioned + 0001_initial.sql applied to remote D1** |
| Cloudflare secrets | ORACLE_SECRET, HELIUS_RPC_URL, PURCHASE_WEBHOOK_HMAC | operator worker | ✅ **set via wrangler secret put** |
| End-to-end pipeline | webhook → Queue → consumer → D1 → /settle/run → settled | live worker | ✅ **verified** — POSTed signed payload, observed pending_commission row + settlement run via `/settle/status` |
| Plan + intel + tasks | requirements, plan, colosseum-intel, todos | `instruction/work/` | ✓ |
| Public docs | architecture.md, mechanics.md, payout.md, operator-guide.md | `docs/` | ✓ |
| Public README | pitch + 60-sec arch + quickstart + repo layout + license | `README.md` | ✓ live URLs filled — 2 video URLs to fill once recorded |
| Submission package | HANDOFF (you are here), pitch-script, tech-demo-script, pitch-deck-outline | `submission/` | ✓ |
| CI | `.github/workflows/ci.yml` typecheck + anchor build | repo | ✓ scaffolded; runs once GitHub repo exists |

**Commit history (so far):**
```
44fd44b fix(programs): use guaranteed-decodable placeholder program IDs
1a9c3ba fix(web): tolerate missing program-id env vars during static export
e856f88 fix: TypeScript typecheck clean across operator + web + sdk
4ed7c36 docs(public): mechanics + payout + operator-guide; tests(operator): hmac
b3a6fbe feat(web,operator,docs): full app surface + submission package
86d1586 chore: initial scaffold
```

## Live URLs (already deployed by the agent — judges can hit these now)

| Surface | URL | Status |
|---|---|---|
| Frontend (Cloudflare Pages) | https://conexple-pages-web.pages.dev | ✅ live, 8/8 static pages, Phantom adapter |
| Operator API (Cloudflare Workers) | https://conexple-worker-operator.sornwin.workers.dev | ✅ live, cron registered, Queue bound, all endpoints respond |
| `/health` | https://conexple-worker-operator.sornwin.workers.dev/health | ✅ 200 OK |
| `/settle/status` | https://conexple-worker-operator.sornwin.workers.dev/settle/status | ✅ returns recent settlement runs |
| `/webhook/purchase` | https://conexple-worker-operator.sornwin.workers.dev/webhook/purchase | ✅ HMAC-verified ingest → Queue → D1 |

The on-chain layer (Anchor programs on Solana devnet) is **not yet
deployed** — the toolchain finished installing partway through the
session and the public devnet airdrop hit its rate limit. See
the "Resume runbook" below for the steps you (or the agent in a
follow-up session) need to run.

## Devnet airdrop is rate-limited — fund manually (one-time, ~30 sec)

The agent verified all 4 programs compile and built `.so` files (target/
gitignored — recompile with `anchor build` in WSL after cloning). The
ONLY thing blocking `anchor deploy --provider.cluster devnet` is funding.

The deployer pubkey `8TLJpd7yJZD4ufSbK4YirnMhNdN68mVmfGvnsNztkLz8` is at
zero SOL. The public devnet faucet rejects this IP with 429 ("airdrop
limit today reached"). The agent tried three faucets via Playwright
automation and hit:

| Faucet | Result |
|---|---|
| `faucet.solana.com` | Requires GitHub OAuth (browser + Cloudflare Turnstile + AI agent block) |
| `faucet.quicknode.com/solana/devnet` | Requires existing mainnet SOL on the wallet (anti-abuse) |
| `dev-faucet.solanahub.app` | Backed by the same `api.devnet.solana.com`, also 429 |

To proceed, **fund the deployer manually**:

1. Open https://faucet.solana.com in your browser (logged into GitHub)
2. Paste pubkey: `8TLJpd7yJZD4ufSbK4YirnMhNdN68mVmfGvnsNztkLz8`
3. Pick "5" → "Confirm Airdrop"
4. Wait for the success notification
5. Verify with: `wsl bash -c "/root/.local/share/solana/install/active_release/bin/solana balance --url devnet 8TLJpd7yJZD4ufSbK4YirnMhNdN68mVmfGvnsNztkLz8"`

Then run the auto-deploy chain:

```pwsh
wsl bash /mnt/c/Users/suanw/projects/conexple/alpha/agent-temp/wsl-deploy.sh
wsl bash /mnt/c/Users/suanw/projects/conexple/alpha/agent-temp/post-deploy.sh
```

The first script does `anchor deploy` (uses ~5 SOL across 4 programs).
The second script runs `init-network.ts`, `mint-demo-usdc.ts`,
`seed-demo.ts`, and `e2e-smoke.ts` — populating the demo network and
writing a Solscan link to `submission/smoke-receipt.json`.

## What only you can do

### 1. Generate the pitch + technical demo videos

The hackathon requires **two** videos (per `instruction/work/colosseum-intel.md`):

- **Video 1 — Pitch (≤ 3 min):** record yourself + slides. Script in
  `submission/pitch-script.md`.
- **Video 2 — Technical demo (2–3 min):** screen recording of the
  deployed demo. Script in `submission/tech-demo-script.md`.

Tools:
- Loom is the de-facto standard at Colosseum (judges expect it).
- YouTube unlisted is also acceptable and easier to embed.

Don't read the slides. Voice over the screen recording. Captions
help non-Thai judges.

### 2. Submit at arena.colosseum.org

Sign in with the email you registered for the hackathon
(`suanwin.paows@gmail.com` if you used the same one). Fill in:

- Project name: **Conexple**
- Tagline: *Open-source consumer affiliate protocol on Solana —
  redirect existing merchant marketing commissions to everyday
  consumers, not influencers.*
- Description: lift from `README.md` "What is Conexple" section
- GitHub URL: `https://github.com/conexple/conexple` (publish first —
  see step 3)
- Demo URL: the Cloudflare Pages URL captured by the deploy script
- Pitch video URL: Loom or YouTube unlisted from step 1
- Technical demo video URL: same, from step 1
- **Tick the Public Goods award checkbox** if it exists in the form
  (Apache 2.0 + open protocol fits perfectly — see colosseum-intel.md)

### 3. Publish the repo (this is the tricky one)

The code is currently in a local git repo at `C:\Users\suanw\projects\conexple\alpha`
on `main` branch. To publish:

```pwsh
# In PowerShell, from alpha/
gh repo create conexple/conexple --public --description "Open-source consumer affiliate protocol on Solana"
git remote add origin https://github.com/conexple/conexple.git
git push -u origin main
```

This requires the `conexple` GitHub organization to exist. If you
haven't created it yet, either:

- Create the org via the GitHub UI (free, takes 30 seconds) and
  publish there, or
- Publish under your personal account: `gh repo create suanwin-paows/conexple --public`
  and update the README's "Repo target" line accordingly.

Pre-publish, run the secret scrub:

```bash
git log -p | grep -iE "secret|key|password|.env" | head
# expect: zero matches in committed diff
ls keys/
# expect: only .gitkeep — never commit JSON keypairs
```

### 4. Record traction (optional, recommended)

Per Colosseum-intel: even small traction signals matter.

- Tweet 1 thread on the founder's X account day-of submission with
  the demo URL and the simulator embed.
- Post the same in 1 Solana Thai Telegram (e.g. Solana Thailand,
  Bitkub developer community).
- 5 quoted replies = evidence of validation. Screenshot for the deck.

## What the agent build did NOT finish

These are listed honestly so you can decide whether to push more or
ship as-is.

### A. Anchor build + deploy

This is the only step that didn't complete in the agent session, and
it's strictly because of a Windows-native build-tools gap. Two paths
forward; pick whichever finishes first.

**Path 1 — WSL Ubuntu (probably already further along)**

The agent kicked off a WSL install of Rust + Solana CLI + Anchor in
the background. By session end it had finished `apt install` and was
on the rustup step. Verify:

```pwsh
wsl bash -c "/root/.cargo/bin/rustc --version 2>/dev/null; /root/.local/share/solana/install/active_release/bin/solana --version 2>/dev/null; /root/.cargo/bin/anchor --version 2>/dev/null"
```

If any line is empty, the install is still in flight. Re-run after
30–60 minutes, or run `wsl bash /mnt/c/Users/suanw/projects/conexple/alpha/agent-temp/wsl-install.sh`
to resume. Once all three print versions:

```bash
wsl bash -lc "
  source \$HOME/.cargo/env
  export PATH=/root/.local/share/solana/install/active_release/bin:\$PATH
  cd /mnt/c/Users/suanw/projects/conexple/alpha
  solana-keygen new --no-bip39-passphrase -o keys/devnet-deployer.json --force
  solana config set --url devnet --keypair keys/devnet-deployer.json
  solana airdrop 5
  anchor build
  anchor keys sync
  anchor build
  anchor deploy --provider.cluster devnet
  anchor keys list
"
```

**Path 2 — Windows native + MSVC Build Tools (also kicked off in background)**

The agent started `winget install Microsoft.VisualStudio.2022.BuildTools`
in the background. Once that finishes (~3 GB download, 10–20 min):

```pwsh
# Verify MSVC linker is reachable
where.exe link.exe   # expect: C:\Program Files\Microsoft Visual Studio\...\bin\Hostx64\x64\link.exe
                     #          (BEFORE C:\Program Files\Git\usr\bin\link.exe)

# Restore PATH order (close + reopen the shell after VS install) and:
$env:Path = "C:\Users\suanw\.local\bin;C:\Users\suanw\.local\share\solana\install\active_release\bin;C:\Users\suanw\.cargo\bin;$env:Path"
cd C:\Users\suanw\projects\conexple\alpha
anchor build
anchor deploy --provider.cluster devnet
```

The agent already pre-extracted `platform-tools v1.52` to
`C:\Users\suanw\.cache\solana\v1.52\platform-tools\` and pre-created
the directory junction at
`C:\Users\suanw\.local\share\solana\install\active_release\bin\platform-tools-sdk\sbf\dependencies\platform-tools`,
so `cargo-build-sbf` will not try to download/symlink the toolchain.

If `link.exe` from Git for Windows is still earlier in PATH than
MSVC's, **remove `C:\Program Files\Git\usr\bin` from the PATH** for
the build session — Git's `link.exe` is GNU coreutils' hard-link
creator and shadows MSVC's linker. Or just put MSVC's bin first.

**After either path succeeds:**

```bash
# capture program IDs (already in Anchor.toml from anchor keys sync — verify)
cat Anchor.toml | grep "conexple_"

# initialize on chain
pnpm exec tsx scripts/init-network.ts
pnpm exec tsx scripts/mint-demo-usdc.ts
pnpm exec tsx scripts/seed-demo.ts
pnpm smoke
```

Update `apps/operator/wrangler.toml`, `apps/web/.env.production`, and
the root `.env` with the four real program IDs (already auto-synced
into Anchor.toml + lib.rs by `anchor keys sync`).

### B. Operator backend deployment

After Anchor deploy:

```pwsh
# Generate fresh oracle keypair for the worker (separate from deployer)
solana-keygen new --no-bip39-passphrase -o keys/oracle-devnet.json
solana airdrop 1 (pubkey from above) --url devnet

# Convert JSON keypair to base58 string for ORACLE_SECRET
node -e "const k = require('./keys/oracle-devnet.json'); const bs58 = require('bs58'); console.log(bs58.default.encode(Uint8Array.from(k)))"

# Set secrets
cd apps/operator
echo "<base58 string>" | wrangler secret put ORACLE_SECRET
echo "https://devnet.helius-rpc.com/?api-key=YOUR_KEY" | wrangler secret put HELIUS_RPC_URL
echo "$(openssl rand -hex 32)" | wrangler secret put PURCHASE_WEBHOOK_HMAC

# Apply D1 migrations
pnpm db:apply:remote

# Deploy
pnpm deploy
```

### C. Frontend deployment

```pwsh
cd apps/web
# Set env vars (next build picks up .env.production)
cat > .env.production <<EOF
NEXT_PUBLIC_RPC_URL=https://conexple-worker-operator.workers.dev/rpc
NEXT_PUBLIC_NETWORK_ID=1
NEXT_PUBLIC_PROGRAM_PROTOCOL=<from anchor keys list>
NEXT_PUBLIC_PROGRAM_NETWORK=<from anchor keys list>
NEXT_PUBLIC_PROGRAM_ESCROW=<from anchor keys list>
NEXT_PUBLIC_PROGRAM_NETWORK=<from anchor keys list>
NEXT_PUBLIC_DEMO_USDC_MINT=<from mint-demo-usdc.ts output>
NEXT_PUBLIC_OPERATOR_URL=https://conexple-worker-operator.workers.dev
EOF
pnpm build
pnpm wrangler pages deploy .next  # or use git integration
```

### D. End-to-end smoke

After all of the above:

```pwsh
pnpm smoke   # writes submission/smoke-receipt.json with a Solscan link
```

Open the Solscan link. If you see one transaction with a
`record_purchase` log, you have your "on-chain proof" for the pitch
video.

### E. Pitch deck

Outline only — see `submission/pitch-deck-outline.md`. Build the
deck in Keynote / Google Slides / Pitch.com. 12 slides max.

## Where things live

| File | Why |
|---|---|
| `instruction/work/requirements.md` | original user instruction + interpretation |
| `instruction/work/plan.md` | the master plan + decision log |
| `instruction/work/colosseum-intel.md` | hackathon field intel — read before recording |
| `instruction/work/todos.md` | active task list (mostly resolved) |
| `submission/HANDOFF.md` | THIS file |
| `submission/pitch-script.md` | 3-min pitch script |
| `submission/tech-demo-script.md` | 2–3 min technical demo script |
| `submission/pitch-deck-outline.md` | 12-slide outline |
| `submission/smoke-receipt.json` | populated after pnpm smoke runs |

## What was deliberately NOT built

Per `docs/00-goals.md §Hard non-goals` and the cut-list in
`instruction/work/plan.md`:

- ❌ Mainnet deployment, real merchants, real funds
- ❌ Audited contracts (we say so explicitly in README + SECURITY.md)
- ❌ CNXP token, GameFi, InsureCare verticals
- ❌ Mobile app, DAO governance
- 🟡 Infinity Override implementation — concept is in code path but
  not actively triggered in the demo (V1 default qualifier never
  matches in the seed because no wallet has 10× spend)
- 🟡 Token-2022 — V1 uses legacy SPL Token for the mock USDC mint
  to keep escrow program simple
- 🟡 Durable Objects — V1 uses D1 idempotency keys instead, to stay
  on the Workers Free plan ($0/mo)

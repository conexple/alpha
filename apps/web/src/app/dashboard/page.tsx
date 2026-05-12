"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import {
  readPosition, readNetwork, readAllPositions,
  type PositionView, type NetworkView,
  formatUsdc, relativeTime, shortenPub, solscanAccount, solscanTx,
} from "@/lib/program-clients";
import { registerMember } from "@/lib/wallet-actions";
import { StatTile } from "@/components/StatTile";
import { PubkeyChip } from "@/components/PubkeyChip";

const NetworkTree = dynamic(() => import("@/components/NetworkTree").then((m) => m.NetworkTree), {
  ssr: false,
});

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const [pos, setPos] = useState<PositionView | null | undefined>(undefined);
  const [net, setNet] = useState<NetworkView | null>(null);
  const [all, setAll] = useState<PositionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readNetwork().then((n) => !cancelled && setNet(n)).catch(() => {});
    readAllPositions().then((a) => !cancelled && setAll(a)).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setPos(undefined);
      return;
    }
    let cancelled = false;
    setPos(undefined);
    readPosition(publicKey)
      .then((p) => !cancelled && setPos(p))
      .catch((e) => !cancelled && setError(String(e).slice(0, 200)));
    return () => { cancelled = true; };
  }, [publicKey?.toBase58()]);

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-8 py-16 text-center">
        <span className="pill mx-auto"><span className="h-1.5 w-1.5 rounded-full bg-cnx-amber" />Wallet required</span>
        <h1 className="font-display text-5xl text-ink">Connect to see your position</h1>
        <p className="text-graphite">
          Use Phantom (or any Solana wallet) pointed at <strong>devnet</strong>.
          The network is pre-seeded with 21 demo wallets across 3 distinct
          trees — your wallet probably won't be a member yet, and that's fine.
        </p>
        <p className="mx-auto max-w-md rounded-md border border-cnx-amber/40 bg-cnx-amber/5 p-3 text-xs text-cnx-amber">
          <strong>First time on devnet?</strong> You'll need a tiny amount of
          SOL (~0.005) to pay rent on the Position PDA. Grab some at{" "}
          <a
            href="https://faucet.solana.com"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            faucet.solana.com
          </a>{" "}
          before clicking Register below.
        </p>
        <div className="flex justify-center"><WalletMultiButton /></div>
      </div>
    );
  }

  if (error) {
    return <p className="card text-cnx-rose">{error}</p>;
  }

  if (pos === undefined) {
    return <Skeleton />;
  }

  // Derive uplines from `all` by walking parent links
  const uplines: PositionView[] = [];
  if (pos && all) {
    let cur: PositionView | null = pos;
    while (cur && cur.parent) {
      const next = all.find((p) => p.wallet.toBase58() === cur!.parent!.toBase58());
      if (!next) break;
      uplines.push(next);
      cur = next;
      if (uplines.length >= 5) break;
    }
  }

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Your position</span>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">Dashboard</h1>
          <PubkeyChip value={publicKey!} showFull />
        </div>
        {pos && (
          <span
            className={`pill ${
              pos.status === "active"
                ? "border-cnx-olive/40 bg-cnx-olive/10 text-cnx-olive"
                : "border-cnx-rose/40 bg-cnx-rose/10 text-cnx-rose"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${pos.status === "active" ? "bg-cnx-olive" : "bg-cnx-rose"}`} />
            {pos.status === "active" ? "Active position" : "Expired"}
          </span>
        )}
      </header>

      {!pos ? (
        <NoPosition />
      ) : (
        <PositionDetails pos={pos} net={net} uplines={uplines} />
      )}

      {all && all.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-ink">Where you sit in the network</h2>
          <p className="text-sm text-graphite">
            {pos
              ? "Your position is highlighted. Click any node to open it on Solscan."
              : "Connect a wallet that's a member to see your placement highlighted."}
          </p>
          <NetworkTree
            positions={all}
            highlightWallet={publicKey?.toBase58()}
            currentRound={net?.cycleIndex ?? null}
          />
        </section>
      )}
    </div>
  );
}

function PositionDetails({
  pos, net, uplines,
}: { pos: PositionView; net: NetworkView | null; uplines: PositionView[] }) {
  const cap = pos.earningsCap;
  const progress = cap === 0n ? 0 : Math.min(100, Number((pos.cumulativeEarned * 100n) / cap));
  // Ceiling % used — same logic as `progress` above, surfaced as its own card.
  const ceilingPct = progress;
  // Current cycle round, read from the on-chain Network account. Cycle length
  // is daily per wrangler.toml `0 23 * * *` cron, but we derive it from
  // network.cycleIndex directly so we don't need to hardcode CYCLE_SECONDS.
  const round = net?.cycleIndex ?? 0n;
  const roundsBehind = Number(round - pos.lastPurchaseRound);
  // Rotation rule (docs/02 §11): 1 cycle grace, expire after 2 missed. So
  // cyclesUntilExpire = max(0, 2 - roundsBehind). Bounded at 2 so a freshly-
  // active position doesn't render "5 cycles left".
  const cyclesUntilExpire = Math.max(0, 2 - roundsBehind);

  const isExpired = pos.status === "expired" || pos.expiredAt !== null;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Depth" value={`L${pos.depth}`} sub={`level ${pos.depth} of 5 max`} />
        <StatTile label="Cumulative earned" value={pos.cumulativeEarned.toLocaleString()} sub="base units (USDC × 1e6)" emphasis="olive" />
        <StatTile label="Earnings cap" value={cap.toLocaleString()} sub={`spend × multiplier`} emphasis="amber" />
        <StatTile
          label="Cycle activity"
          value={roundsBehind === 0 ? "current" : `−${roundsBehind}`}
          sub={`last purchase round ${pos.lastPurchaseRound.toString()}`}
        />
      </section>

      {/* Rotation state — re-entry card if expired, otherwise 2 status cards */}
      {isExpired ? (
        <div className="card border-cnx-amber">
          <h3 className="font-display text-xl text-ink">Position expired</h3>
          <p className="mt-2 text-sm text-graphite">
            Your position has rotated out. Buy from any participating merchant to
            re-enter at the bottom of the network — and start earning again.
          </p>
          <a href="/explorer" className="mt-3 inline-block text-sm font-medium text-cnx-purple hover:underline">
            Browse the network →
          </a>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card">
            <h3 className="font-display text-base text-ink">Earning ceiling</h3>
            <p className="mt-1 font-display text-3xl text-ink">{ceilingPct}%</p>
            <p className="text-xs text-stone">
              used · {pos.cumulativeEarned.toLocaleString()} / {cap.toLocaleString()} base units
            </p>
          </div>
          <div className="card">
            <h3 className="font-display text-base text-ink">Inactivity rotation</h3>
            <p className="mt-1 font-display text-3xl text-ink">
              {cyclesUntilExpire === 0
                ? "Expiring this cycle"
                : `${cyclesUntilExpire} cycle${cyclesUntilExpire === 1 ? "" : "s"} left`}
            </p>
            <p className="text-xs text-stone">grace = 1 cycle; expire after 2 missed</p>
          </div>
        </div>
      )}

      <section className="card space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl">Earnings cap progress</h2>
          <span className="font-mono text-xs text-stone">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-edge">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cnx-olive via-cnx-amber to-cnx-purple transition-all duration-700"
            style={{ width: `${Math.max(progress, 1)}%` }}
          />
        </div>
        <p className="text-sm text-graphite">
          When this hits 100%, your position locks (extension_locked = true).
          You stop accruing on your own purchases, but commission from your
          downline continues to flow until you've been inactive for 2 cycles —
          then the position expires and your wallet rotates to the bottom of
          the network. <strong className="text-ink">Karma loop.</strong>
        </p>
        {pos.extensionLocked && (
          <span className="pill border-cnx-amber/40 bg-cnx-amber/10 text-cnx-amber">
            <span className="h-1.5 w-1.5 rounded-full bg-cnx-amber" />
            extension_locked
          </span>
        )}
      </section>

      {uplines.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-ink">Your uplines (5 levels)</h2>
          <p className="text-sm text-graphite">
            On every purchase you make, commission flows up these wallets.
            Inactive levels fall through to the social pool.
          </p>
          <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {uplines.map((u, i) => (
              <li key={u.pubkey.toBase58()} className="card flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone">level {i + 1}</span>
                  <span className={`pill text-[10px] ${u.status === "active" ? "border-cnx-olive/40 bg-cnx-olive/10 text-cnx-olive" : "border-cnx-rose/40 bg-cnx-rose/10 text-cnx-rose"}`}>
                    {u.status}
                  </span>
                </div>
                <a
                  href={solscanAccount(u.wallet)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-ink underline-offset-4 hover:underline"
                >
                  {shortenPub(u.wallet, 6)}
                </a>
                <div className="text-[11px] text-stone">
                  joined {relativeTime(u.joinedAt)} · earned {u.cumulativeEarned.toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function NoPosition() {
  const { publicKey, sendTransaction } = useWallet();
  const [initialSpend, setInitialSpend] = useState("1000");
  const [multiplier, setMultiplier] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cap = (() => {
    try {
      return BigInt(initialSpend || "0") * BigInt(multiplier || "0");
    } catch {
      return 0n;
    }
  })();

  async function handleRegister() {
    if (!publicKey || !sendTransaction) return;
    setSubmitting(true);
    setError(null);
    setTxSig(null);
    try {
      const sig = await registerMember(
        { publicKey, sendTransaction },
        BigInt(initialSpend),
        Number(multiplier),
      );
      setTxSig(sig);
      // Give devnet a moment to propagate, then reload so the read-side
      // (readPosition / readAllPositions) picks up the new account.
      setTimeout(() => window.location.reload(), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.slice(0, 280));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card space-y-6 text-graphite">
      <div>
        <h2 className="font-display text-2xl text-ink">No position in this network — yet.</h2>
        <p className="mt-2 max-w-2xl">
          Self-register to mint a Position PDA on chain. You'll start
          unplaced (parent = none) — the oracle assigns you under a referrer
          on the next placement cycle. Until then, your purchases earn
          straight to the social pool.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone">
            Initial spend (base units)
          </span>
          <input
            type="number"
            value={initialSpend}
            onChange={(e) => setInitialSpend(e.target.value)}
            min="1"
            disabled={submitting}
            className="mt-1 w-full rounded-md border border-edge bg-cream px-3 py-2 font-mono text-sm text-ink focus:border-ink focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone">
            Multiplier (×)
          </span>
          <input
            type="number"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            min="1"
            max="100"
            disabled={submitting}
            className="mt-1 w-full rounded-md border border-edge bg-cream px-3 py-2 font-mono text-sm text-ink focus:border-ink focus:outline-none"
          />
        </label>
      </div>

      <p className="text-xs text-stone">
        Earnings cap = initial_spend × multiplier ={" "}
        <strong className="font-mono text-ink">{cap.toLocaleString()}</strong>{" "}
        base units. Once the cap is hit, your position locks (extension_locked)
        and decays after 2 inactive cycles — the karma loop.
      </p>

      <p className="rounded-md border border-cnx-amber/40 bg-cnx-amber/5 p-3 text-xs text-cnx-amber">
        <strong>Need devnet SOL?</strong> Position registration costs ~0.005 SOL
        (PDA rent + tx fee). Devnet airdrops are free at{" "}
        <a
          href="https://faucet.solana.com"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-4 hover:underline"
        >
          faucet.solana.com
        </a>{" "}
        — paste your wallet pubkey, request 1 SOL, come back here.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleRegister}
          disabled={submitting || !publicKey || !sendTransaction || cap === 0n}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-cream transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting on chain…" : "Register me on chain →"}
        </button>
        {txSig && (
          <a
            href={solscanTx(txSig)}
            target="_blank"
            rel="noreferrer"
            className="pill border-cnx-olive/40 bg-cnx-olive/10 text-cnx-olive"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cnx-olive animate-pulse-soft" />
            tx {shortenPub(txSig, 6)} confirmed · view on Solscan
          </a>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-cnx-rose/40 bg-cnx-rose/5 p-3 font-mono text-xs text-cnx-rose">
          {error}
        </p>
      )}

      <p className="text-xs text-stone">
        Or browse the seeded network in{" "}
        <a href="/explorer" className="text-ink underline-offset-4 hover:underline">
          /explorer
        </a>
        {" "}— 21 wallets across 3 trees.
      </p>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-12 w-64 animate-pulse rounded-md bg-edge/60" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-edge/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-edge/60" />
    </div>
  );
}

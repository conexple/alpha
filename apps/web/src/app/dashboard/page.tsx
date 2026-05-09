"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import {
  readPosition, readNetwork, readAllPositions,
  type PositionView, type NetworkView,
  formatUsdc, relativeTime, shortenPub, solscanAccount,
} from "@/lib/program-clients";
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
          The network is pre-seeded with 16 demo wallets — your wallet
          probably won't be a member yet, and that's fine.
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
          <NetworkTree positions={all} highlightWallet={publicKey?.toBase58()} />
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
  const round = net?.cycleIndex ?? 0n;
  const roundsBehind = Number(round - pos.lastPurchaseRound);
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
  return (
    <section className="card space-y-4 text-graphite">
      <h2 className="font-display text-2xl text-ink">No position in this network — yet.</h2>
      <p>
        For the demo, the agent pre-seeded 16 wallets in a 5-level tree.
        Your connected wallet isn't one of them — that's expected. To
        actually join, you'd need a referrer to invite you, which the
        operator's placement engine would resolve.
      </p>
      <p className="text-sm">
        For now, browse the seeded network in <a href="/explorer" className="text-ink underline-offset-4 hover:underline">/explorer</a> →
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

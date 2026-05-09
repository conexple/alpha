"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { readPosition, readNetwork, type PositionView, type NetworkView } from "@/lib/program-clients";

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const [position, setPosition] = useState<PositionView | null>(null);
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setPosition(null);
      return;
    }
    let cancelled = false;
    Promise.all([readPosition(publicKey), readNetwork()])
      .then(([p, n]) => {
        if (cancelled) return;
        setPosition(p);
        setNetwork(n);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [publicKey?.toBase58()]);

  if (!connected) {
    return (
      <div className="space-y-3 pt-12 text-center">
        <h1 className="text-2xl font-semibold">Connect your wallet</h1>
        <p className="text-white/70">Phantom on Solana devnet, please.</p>
      </div>
    );
  }
  if (error) return <p className="text-cnx-err">{error}</p>;
  if (!position || !network) return <p className="text-white/60">Loading…</p>;

  const cap = position.earningsCap === 0n ? "n/a" : position.earningsCap.toString();
  const progress = position.earningsCap === 0n ? 0 : Number((position.cumulativeEarned * 100n) / position.earningsCap);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Your position</h1>
        <p className="font-mono text-xs text-white/50">{publicKey?.toBase58()}</p>
      </header>

      {!position.exists && (
        <div className="rounded-2xl border border-cnx-warn/30 bg-cnx-warn/10 p-4 text-cnx-warn">
          You don't have a position in this network yet.
          <br />
          Ask a referrer to send a placement request, or visit{" "}
          <a className="underline" href="/explorer">network</a> to browse.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Status" value={position.exists ? position.status : "—"} highlight={position.status === "active"} />
        <Stat label="Depth" value={position.exists ? String(position.depth) : "—"} />
        <Stat label="Locked?" value={position.extensionLocked ? "yes" : "no"} />
        <Stat
          label="Earned (cumulative)"
          value={`${position.cumulativeEarned.toString()} / ${cap}`}
        />
        <Stat label="Last purchase round" value={position.lastPurchaseRound.toString()} />
        <Stat label="Cycle (network)" value={network.cycleIndex.toString()} />
      </section>

      {position.exists && (
        <div>
          <div className="text-sm text-white/60">Cap progress</div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-cnx-accent to-cnx-accent2"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-white/50">{progress}% of cap</div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 p-4 text-sm text-white/70">
        <strong>What this means:</strong>
        <br />
        Your position earns from purchases by your downline (up to 5 levels deep) — see{" "}
        <a className="underline" href="/explorer">network</a>.
        Earnings stop when you hit cap (10× your initial spend by default), and the slot
        recycles to the bottom — that's the karma loop.
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${highlight ? "text-cnx-accent2" : ""}`}>{value}</div>
    </div>
  );
}

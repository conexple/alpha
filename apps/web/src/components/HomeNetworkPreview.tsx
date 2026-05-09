"use client";

import { useEffect, useState } from "react";
import { readAllPositions, readNetwork, type PositionView, type NetworkView } from "@/lib/program-clients";
import { NetworkTree } from "./NetworkTree";
import { StatTile } from "./StatTile";

export function HomeNetworkPreview() {
  const [positions, setPositions] = useState<PositionView[] | null>(null);
  const [network, setNetwork] = useState<NetworkView | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([readAllPositions(), readNetwork()])
      .then(([p, n]) => {
        if (cancelled) return;
        setPositions(p);
        setNetwork(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const active = positions?.filter((p) => p.status === "active").length ?? 0;
  const expired = positions?.filter((p) => p.status === "expired").length ?? 0;
  const maxDepth = positions ? Math.max(...positions.map((p) => p.depth)) : 0;
  const totalEarned = positions
    ? positions.reduce((sum, p) => sum + Number(p.cumulativeEarned), 0)
    : 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-3xl text-ink">
          Live on Solana devnet
          <span className="ml-3 inline-flex h-2 w-2 animate-pulse-soft rounded-full bg-cnx-olive" aria-hidden />
        </h2>
        <span className="font-mono text-xs text-stone">
          read directly from chain · no backend cache
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Network members" value={positions ? positions.length : "…"} sub={`${active} active · ${expired} expired`} />
        <StatTile label="Cycle" value={network ? network.cycleIndex.toString() : "…"} sub="daily settlement" />
        <StatTile label="Max depth" value={maxDepth || "…"} sub="L0 root → L5 leaf" emphasis="amber" />
        <StatTile label="Total earned" value={totalEarned.toLocaleString()} sub="base units across uplines" emphasis="olive" />
      </div>

      <div>
        {positions === null ? (
          <div className="rounded-2xl border border-edge bg-paper p-12 text-center text-sm text-stone">
            <span className="inline-flex animate-spin">◐</span>{" "}
            Loading network from devnet…
          </div>
        ) : (
          <NetworkTree positions={positions} />
        )}
      </div>
    </section>
  );
}

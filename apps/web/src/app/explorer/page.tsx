"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  readAllPositions, readAllPurchases, readNetwork,
  type PositionView, type PurchaseView, type NetworkView,
  shortenPub, solscanAccount, relativeTime,
} from "@/lib/program-clients";
import { StatTile } from "@/components/StatTile";
import { PubkeyChip } from "@/components/PubkeyChip";

const NetworkTree = dynamic(() => import("@/components/NetworkTree").then((m) => m.NetworkTree), { ssr: false });

export default function ExplorerPage() {
  const [positions, setPositions] = useState<PositionView[] | null>(null);
  const [purchases, setPurchases] = useState<PurchaseView[] | null>(null);
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([readAllPositions(), readAllPurchases(), readNetwork()])
      .then(([p, q, n]) => {
        if (cancelled) return;
        setPositions(p);
        setPurchases(q);
        setNetwork(n);
      })
      .catch((e) => !cancelled && setError(String(e).slice(0, 200)));
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!positions) return [];
    return positions.filter((p) => {
      if (filter === "active" && p.status !== "active") return false;
      if (filter === "expired" && p.status !== "expired") return false;
      if (search) {
        const q = search.toLowerCase();
        const w = p.wallet.toBase58().toLowerCase();
        if (!w.includes(q)) return false;
      }
      return true;
    });
  }, [positions, filter, search]);

  const byDepth = useMemo(() => {
    const m = new Map<number, number>();
    if (!positions) return m;
    for (const p of positions) m.set(p.depth, (m.get(p.depth) ?? 0) + 1);
    return m;
  }, [positions]);

  const totalEarned = useMemo(
    () => positions?.reduce((s, p) => s + Number(p.cumulativeEarned), 0) ?? 0,
    [positions],
  );

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone">Public explorer</span>
          <h1 className="mt-1 font-display text-4xl text-ink sm:text-5xl">
            The network, on chain
          </h1>
          <p className="mt-3 max-w-2xl text-graphite">
            Every position you see is read directly from a{" "}
            <code className="font-mono text-sm text-ink">getProgramAccounts</code>
            call against the deployed conexple_network program on Solana
            devnet. No backend cache, no operator filter.
          </p>
        </div>
        {network && (
          <span className="pill"><span className="h-1.5 w-1.5 rounded-full bg-cnx-olive" />cycle {network.cycleIndex.toString()}</span>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Members" value={positions?.length ?? "…"} />
        <StatTile label="Active" value={positions?.filter((p) => p.status === "active").length ?? "…"} emphasis="olive" />
        <StatTile label="Expired" value={positions?.filter((p) => p.status === "expired").length ?? "…"} sub="rotated to bottom" />
        <StatTile label="Purchases" value={purchases?.length ?? "…"} sub="recorded on chain" emphasis="purple" />
        <StatTile label="Total earned" value={totalEarned.toLocaleString()} sub="across uplines" emphasis="amber" />
      </section>

      {error && <p className="card text-cnx-rose">{error}</p>}

      <section className="space-y-4">
        <h2 className="font-display text-2xl text-ink">Tree visualization</h2>
        {positions === null ? (
          <div className="h-72 animate-pulse rounded-2xl bg-edge/60" />
        ) : (
          <NetworkTree positions={positions} />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl text-ink">Position table</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="filter by pubkey"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-full border border-edge bg-paper px-4 py-1.5 font-mono text-xs text-ink placeholder:text-stone focus:border-ink focus:outline-none"
            />
            <div className="flex gap-1 rounded-full border border-edge bg-paper p-1 text-xs">
              {(["all", "active", "expired"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-full px-3 py-1 transition-colors ${
                    filter === k ? "bg-ink text-cream" : "text-graphite hover:text-ink"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-[10px] uppercase tracking-[0.18em] text-stone">
              <tr>
                <th className="px-5 py-3">Wallet</th>
                <th className="px-3 py-3">Parent</th>
                <th className="px-3 py-3 text-right">Depth</th>
                <th className="px-3 py-3 text-right">Earned</th>
                <th className="px-3 py-3 text-right">Cap</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {filtered.map((p) => (
                <tr key={p.pubkey.toBase58()} className="hover:bg-cream/60">
                  <td className="px-5 py-3 font-mono text-xs">
                    <a className="text-ink underline-offset-4 hover:underline" href={solscanAccount(p.wallet)} target="_blank" rel="noreferrer">
                      {shortenPub(p.wallet, 6)}
                    </a>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-graphite">
                    {p.parent ? shortenPub(p.parent) : "—"}
                  </td>
                  <td className="num px-3 py-3 text-right font-mono text-xs">L{p.depth}</td>
                  <td className="num px-3 py-3 text-right font-mono text-xs">
                    {p.cumulativeEarned.toLocaleString()}
                  </td>
                  <td className="num px-3 py-3 text-right font-mono text-xs text-stone">
                    {p.earningsCap.toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs ${p.status === "active" ? "text-cnx-olive" : "text-cnx-rose"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-graphite">{relativeTime(p.joinedAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && positions && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-stone">
                    No positions match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-3 pt-1 text-xs text-stone">
          {[...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => (
            <span key={d} className="font-mono">
              L{d}: <span className="text-ink">{n}</span>
            </span>
          ))}
        </div>
      </section>

      {purchases && purchases.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-ink">Recent purchases</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {purchases.slice(0, 9).map((p) => (
              <article key={p.pubkey.toBase58()} className="card space-y-2">
                <div className="flex items-baseline justify-between">
                  <PubkeyChip value={p.wallet} label="buyer" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone">round {p.round.toString()}</span>
                </div>
                <div className="num font-display text-3xl text-cnx-purple">
                  {p.totalAmount.toLocaleString()}
                </div>
                <div className="text-xs text-graphite">
                  {p.purchaseCount} {p.purchaseCount === 1 ? "purchase" : "purchases"} · {relativeTime(p.lastAt)}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

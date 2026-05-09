"use client";

import { useEffect, useState } from "react";
import { recentNetworkTxs, type TxSummary } from "@/lib/program-clients";
import { PubkeyChip } from "./PubkeyChip";

export function TxFeed({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = useState<TxSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    recentNetworkTxs(limit)
      .then((r) => !cancelled && setItems(r))
      .catch((e) => !cancelled && setError(String(e).slice(0, 200)));
    return () => { cancelled = true; };
  }, [limit]);

  if (error) {
    return (
      <div className="card text-sm text-cnx-rose">
        Couldn't load tx feed: {error}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-lg">Recent on-chain activity</h3>
        <span className="text-[10px] uppercase tracking-[0.18em] text-stone">live · devnet</span>
      </div>
      {!items ? (
        <Skeleton rows={4} />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-edge text-sm">
          {items.map((t) => (
            <li key={t.signature} className="flex items-center justify-between gap-3 py-2.5">
              <span className={t.err ? "text-cnx-rose" : "text-cnx-olive"}>
                {t.err ? "✗ failed" : "✓ confirmed"}
              </span>
              <span className="text-xs text-stone">slot {t.slot.toLocaleString()}</span>
              <span className="ml-auto text-xs text-graphite">
                {t.blockTime ? new Date(t.blockTime * 1000).toLocaleTimeString() : "—"}
              </span>
              <PubkeyChip value={t.signature} kind="tx" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="h-8 animate-pulse rounded-md bg-edge/60"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </ul>
  );
}

"use client";

import { PublicKey } from "@solana/web3.js";
import { shortenPub, solscanAccount, solscanTx } from "@/lib/program-clients";

interface Props {
  value: PublicKey | string;
  label?: string;
  kind?: "account" | "tx";
  showFull?: boolean;
}

export function PubkeyChip({ value, label, kind = "account", showFull = false }: Props) {
  const s = typeof value === "string" ? value : value.toBase58();
  const href = kind === "tx" ? solscanTx(s) : solscanAccount(s);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-1.5 rounded-md border border-edge bg-cream px-2 py-1 font-mono text-[11px] text-graphite transition-colors hover:border-ink hover:text-ink"
      title={label ? `${label}: ${s}` : s}
    >
      {showFull ? s : shortenPub(s)}
      <span className="text-stone group-hover:text-ink">↗</span>
    </a>
  );
}

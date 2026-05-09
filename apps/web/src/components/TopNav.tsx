"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/explorer", label: "Network" },
  { href: "/operator", label: "Operator" },
  { href: "/merchant", label: "Merchant" },
];

export function TopNav() {
  return (
    <header className="border-b border-white/10 bg-cnx-ink/80 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-mono text-lg tracking-tight">
          conexple<span className="text-cnx-accent2">.</span>
        </Link>
        <nav className="hidden gap-6 text-sm text-white/80 md:flex">
          {links.slice(1).map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
        <WalletMultiButton />
      </div>
    </header>
  );
}

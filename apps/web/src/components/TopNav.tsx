"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/explorer", label: "Network" },
  { href: "/operator", label: "Operator" },
  { href: "/merchant", label: "Merchant" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-cream/85 backdrop-blur-md">
      <div className="container-page flex items-center justify-between py-4">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tracking-tightest text-ink">
            conexple
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-cnx-purple transition-transform group-hover:scale-150" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-stone sm:inline">
            v0.1 alpha
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
          {links.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative transition-colors ${
                  active ? "text-ink" : "text-stone hover:text-ink"
                }`}
              >
                {l.label}
                {active && (
                  <span className="absolute -bottom-[19px] left-0 right-0 h-px bg-ink" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/conexple/alpha"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-full border border-edge bg-paper px-3 py-1.5 text-xs font-medium text-graphite transition-colors hover:border-ink hover:text-ink sm:inline-flex"
          >
            GitHub →
          </a>
          <WalletMultiButton />
        </div>
      </div>

      {/* Mobile nav */}
      <div className="container-page flex items-center gap-5 overflow-x-auto border-t border-edge py-2 text-xs font-medium md:hidden">
        {links.map((l) => {
          const active = pathname === l.href || pathname?.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "text-ink" : "text-stone"}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

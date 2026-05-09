import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Conexple — Open Consumer Affiliate Protocol",
  description:
    "Redirect existing merchant marketing commissions to everyday consumers — on Solana, on-chain, anti-MLM by design.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <TopNav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-12 text-xs text-cnx-muted">
            v0.1 alpha · hackathon prototype · devnet only ·{" "}
            <a
              className="underline"
              href="https://github.com/conexple/conexple"
              target="_blank"
              rel="noreferrer"
            >
              github
            </a>
          </footer>
        </WalletProviders>
      </body>
    </html>
  );
}

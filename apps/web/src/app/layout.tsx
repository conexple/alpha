import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Conexple — Open consumer affiliate protocol on Solana",
  description:
    "Redirect existing merchant marketing commissions to everyday consumers — 5-level unilevel + Infinity Override on Solana, on-chain rules, anti-MLM by structural design.",
  metadataBase: new URL("https://conexple-pages-web.pages.dev"),
  openGraph: {
    title: "Conexple — Open consumer affiliate protocol",
    description: "Pay loyal customers, not influencers. On-chain on Solana.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <TopNav />
          <main className="container-page py-10 sm:py-16">{children}</main>
          <SiteFooter />
        </WalletProviders>
      </body>
    </html>
  );
}

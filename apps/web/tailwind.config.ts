import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Distinctive serif display for headlines — character + gravitas
        display: ['"Fraunces"', '"Instrument Serif"', "Georgia", "serif"],
        // Clean modern sans for body
        sans: ['"Geist"', '"DM Sans"', "system-ui", "sans-serif"],
        // Chain data, addresses, tx hashes
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', "ui-monospace", "monospace"],
        // Thai (matches Sornkan's warmth)
        thai: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', "system-ui", "sans-serif"],
      },
      colors: {
        // Conexple palette — warm cream like aged paper +
        // Solana accents as "earned" highlights
        cream: "#FBF7F1",      // primary background
        paper: "#F4EFE6",       // card surface
        ink: "#0E1116",         // primary text
        graphite: "#3B3A36",    // secondary text
        stone: "#8B847B",       // muted
        cnx: {
          purple: "#9945FF",    // Solana primary
          teal: "#14F195",      // Solana secondary
          amber: "#E8B14E",     // accent — harvest/reward
          rose: "#D9534A",      // alerts
          olive: "#5C6B3A",     // success / active node
        },
        // Border tones
        edge: "#E5DDCD",
        ring: "#0E1116",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(14,17,22,0.04), 0 8px 24px -12px rgba(14,17,22,0.12)",
        card: "0 1px 0 #E5DDCD, 0 12px 32px -16px rgba(14,17,22,0.18)",
      },
      backgroundImage: {
        grain: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.06 0 0 0 0 0.07 0 0 0 0 0.08 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "rise": "rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        "shimmer": "shimmer 2.5s linear infinite",
        "pulse-soft": "pulseSoft 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

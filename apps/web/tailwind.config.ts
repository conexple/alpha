import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Tech-minimal: Geist everywhere (Vercel / Linear vibe)
        display: ['"Geist"', '"Inter"', "system-ui", "sans-serif"],
        sans: ['"Geist"', '"Inter"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "ui-monospace", "monospace"],
        thai: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', "system-ui", "sans-serif"],
      },
      colors: {
        // Tech-minimal palette — neutrals + single Solana purple accent
        cream: "#FFFFFF",      // pure white background (legacy name kept)
        paper: "#FAFAFA",      // subtle off-white surface (zinc-50)
        ink: "#09090B",        // near-black text (zinc-950)
        graphite: "#52525B",   // secondary text (zinc-600)
        stone: "#A1A1AA",      // muted text (zinc-400)
        edge: "#E4E4E7",       // borders (zinc-200)
        cnx: {
          purple: "#9945FF",   // Solana primary — single accent
          teal: "#10B981",     // success / active (emerald-500)
          amber: "#F59E0B",    // attention (amber-500)
          rose: "#EF4444",     // alerts (red-500)
          olive: "#10B981",    // alias — used to denote "live"
        },
        ring: "#09090B",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        soft: "0 0 0 1px rgba(9,9,11,0.04), 0 1px 2px rgba(9,9,11,0.04)",
        card: "0 0 0 1px #E4E4E7",
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

import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Conexple palette — based on Solana purple/teal duotone
        cnx: {
          ink: "#0a0b14",
          paper: "#f7f6f1",
          accent: "#9945ff",
          accent2: "#14f195",
          muted: "#6b7280",
          warn: "#f59e0b",
          err: "#ef4444",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

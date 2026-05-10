// scripts/gen-og.ts — regenerate /public/og.{svg,png} from live devnet data.
//
// What this does:
//   1. Reads all 21 Position accounts off conexple_network on devnet.
//   2. Maps each on-chain wallet pubkey back to its demo label (A..Z, W)
//      using the deterministic seed "conexple-demo-<label>" (32-byte padded),
//      same scheme as scripts/seed-demo.ts.
//   3. Builds adjacency lists, identifies the 3 roots (parent === None),
//      and lays out each tree in its own column-strip.
//   4. Emits /public/og.svg, then shells out to @resvg/resvg-js-cli to
//      render /public/og.png (1200×630, the OG image meta-tagged in
//      apps/web/src/app/layout.tsx).
//
// Re-runnable: overwrites og.svg and og.png in place.
//
// Note on Position size: docs/instruction/work/continue.md says "174 bytes"
// but the on-chain accounts are actually 190 bytes (matches
// programs/conexple-network/src/state.rs and apps/web/src/lib/program-clients.ts:
//   8 disc + 1 bump + 8 + 32 + (1+32) + 1 + 1 + 8 + 8 + 8 + 1 + 8 + (1+8) + 64
//   = 190).

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const NETWORK_PROGRAM = new PublicKey(
  "9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9",
);
// Mirror of POSITION_SIZE in apps/web/src/lib/program-clients.ts.
const POSITION_SIZE =
  8 + 1 + 8 + 32 + (1 + 32) + 1 + 1 + 8 + 8 + 8 + 1 + 8 + (1 + 8) + 64;

// Same label list as scripts/seed-demo.ts (24 demo wallets across 3 trees).
const DEMO_LABELS = [
  "A", "B", "C", "D", "E",
  "F", "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P",
  "Q", "Y", "Z", "W",
  "R",
] as const;
type Label = (typeof DEMO_LABELS)[number];

// ── Position decoding (mirror of apps/web/src/lib/program-clients.ts) ────

interface PositionView {
  pubkey: PublicKey;
  wallet: PublicKey;
  parent: PublicKey | null;
  depth: number;
}

function decodePosition(pubkey: PublicKey, data: Buffer): PositionView {
  let cur = 8; // discriminator
  cur += 1; // bump
  cur += 8; // network_id
  const wallet = new PublicKey(data.subarray(cur, cur + 32));
  cur += 32;
  const parentTag = data.readUInt8(cur);
  cur += 1;
  let parent: PublicKey | null = null;
  if (parentTag === 1) {
    parent = new PublicKey(data.subarray(cur, cur + 32));
    cur += 32;
  }
  const depth = data.readUInt8(cur);
  return { pubkey, wallet, parent, depth };
}

// ── Label resolution via deterministic seed (matches seed-demo.ts) ───────

function deterministicWallet(label: Label): Keypair {
  const seed = Buffer.alloc(32, 0);
  Buffer.from(`conexple-demo-${label}`).copy(seed);
  return Keypair.fromSeed(seed.subarray(0, 32));
}

function buildLabelMap(): Map<string, Label> {
  const m = new Map<string, Label>();
  for (const l of DEMO_LABELS) {
    m.set(deterministicWallet(l).publicKey.toBase58(), l);
  }
  return m;
}

// ── Tree layout ──────────────────────────────────────────────────────────

interface TreeNode {
  label: string;
  walletShort: string;
  children: TreeNode[];
  depth: number; // depth within this subtree (root = 0)
  width: number; // count of leaves in subtree (for x-allocation)
  x: number;
  y: number;
  maxDepth: number; // max depth of any node in subtree
}

function buildTrees(positions: PositionView[], labels: Map<string, Label>): TreeNode[] {
  // adjacency: parent wallet → child positions
  const childrenOf = new Map<string, PositionView[]>();
  const roots: PositionView[] = [];
  for (const p of positions) {
    if (p.parent === null) {
      roots.push(p);
      continue;
    }
    const k = p.parent.toBase58();
    const arr = childrenOf.get(k) ?? [];
    arr.push(p);
    childrenOf.set(k, arr);
  }

  // sort roots A, Q, R order if labels exist; otherwise by joinedAt-equivalent
  roots.sort((a, b) => {
    const la = labels.get(a.wallet.toBase58()) ?? "";
    const lb = labels.get(b.wallet.toBase58()) ?? "";
    return la.localeCompare(lb);
  });

  function build(p: PositionView, depth: number): TreeNode {
    const wKey = p.wallet.toBase58();
    const lbl = labels.get(wKey) ?? "?";
    const kids = (childrenOf.get(wKey) ?? []).slice().sort((a, b) => {
      const la = labels.get(a.wallet.toBase58()) ?? "";
      const lb = labels.get(b.wallet.toBase58()) ?? "";
      return la.localeCompare(lb);
    });
    const childNodes = kids.map((k) => build(k, depth + 1));
    const width =
      childNodes.length === 0
        ? 1
        : childNodes.reduce((s, c) => s + c.width, 0);
    const maxDepth =
      childNodes.length === 0
        ? depth
        : Math.max(...childNodes.map((c) => c.maxDepth));
    return {
      label: lbl,
      walletShort: `${wKey.slice(0, 4)}…${wKey.slice(-4)}`,
      children: childNodes,
      depth,
      width,
      x: 0,
      y: 0,
      maxDepth,
    };
  }
  return roots.map((r) => build(r, 0));
}

function layoutTree(
  root: TreeNode,
  stripX: number,
  stripY: number,
  stripW: number,
  stripH: number,
): void {
  const rows = root.maxDepth + 1; // depths 0..maxDepth inclusive
  const rowGap = rows > 1 ? stripH / (rows - 1) : 0;

  // Recursive x-allocation by leaf-width.
  function place(n: TreeNode, x0: number, x1: number) {
    n.x = (x0 + x1) / 2;
    n.y = stripY + n.depth * rowGap;
    if (n.children.length === 0) return;
    let cursor = x0;
    const total = n.width;
    for (const c of n.children) {
      const w = c.width / total;
      const cx0 = cursor;
      const cx1 = cursor + w * (x1 - x0);
      place(c, cx0, cx1);
      cursor = cx1;
    }
  }
  place(root, stripX, stripX + stripW);
}

// ── SVG rendering ────────────────────────────────────────────────────────

const PALETTE = {
  bg: "#FBF7F1",
  ink: "#0E1116",
  text: "#3B3A36",
  muted: "#8B847B",
  divider: "#E5DDCD",
  edge: "#C7BFAF",
  accent: ["#6B46C1", "#3FB6BB", "#D9A441"], // tree 1 (A), tree 2 (Q), tree 3 (R)
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSvg(trees: TreeNode[], programIds: string[]): string {
  const W = 1200;
  const H = 630;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  );
  parts.push(
    `<defs>` +
      `<filter id="grain" x="0%" y="0%" width="100%" height="100%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.85" stitchTiles="stitch" numOctaves="2"/>` +
      `<feColorMatrix values="0 0 0 0 0.06  0 0 0 0 0.07  0 0 0 0 0.08  0 0 0 0.05 0"/>` +
      `</filter>` +
      `</defs>`,
  );

  // Cream base + paper grain
  parts.push(`<rect width="${W}" height="${H}" fill="${PALETTE.bg}"/>`);
  parts.push(`<rect width="${W}" height="${H}" filter="url(#grain)"/>`);

  // Top divider
  parts.push(
    `<line x1="60" y1="80" x2="${W - 60}" y2="80" stroke="${PALETTE.divider}" stroke-width="1"/>`,
  );

  // Top-left tag
  parts.push(
    `<circle cx="62" cy="48" r="3.5" fill="${PALETTE.accent[0]}"/>` +
      `<text x="76" y="53" font-family="Geist, system-ui, sans-serif" font-size="11" letter-spacing="3" fill="${PALETTE.muted}">CONEXPLE · ALPHA · SOLANA DEVNET</text>`,
  );
  // Top-right tag
  parts.push(
    `<text x="${W - 60}" y="53" text-anchor="end" font-family="Geist, system-ui, sans-serif" font-size="11" letter-spacing="3" fill="${PALETTE.muted}">21 POSITIONS · 3 NETWORKS · LIVE</text>`,
  );

  // Wordmark
  parts.push(
    `<text x="60" y="148" font-family="Fraunces, Georgia, serif" font-size="62" font-weight="500" fill="${PALETTE.ink}" letter-spacing="-2">Conexple</text>`,
  );
  parts.push(
    `<text x="60" y="184" font-family="Geist, system-ui, sans-serif" font-size="18" fill="${PALETTE.text}">Open-source consumer affiliate protocol on Solana</text>`,
  );

  // Middle band: 3 column-strips for 3 trees
  // Inner content: x 60..1140 (width 1080). Strip width = 360.
  // Vertical band: y 220..560 (height 340), with title row at top.
  const STRIP_TOP = 240;
  const STRIP_H = 280;
  const STRIPS_X = [60, 60 + 360, 60 + 720];
  const STRIP_W = 360;

  const treeTitles = ["TREE 1 · ROOT A", "TREE 2 · ROOT Q", "TREE 3 · ROOT R"];

  for (let i = 0; i < 3; i++) {
    const x = STRIPS_X[i]!;
    const w = STRIP_W;

    // Section label
    const accent = PALETTE.accent[i]!;
    const root = trees[i];
    const label =
      treeTitles[i] +
      (root ? ` · ${root.width === 1 && root.children.length === 0 ? "1 NODE" : countNodes(root) + " NODES"}` : "");
    parts.push(
      `<rect x="${x}" y="${STRIP_TOP - 30}" width="6" height="6" fill="${accent}"/>` +
        `<text x="${x + 14}" y="${STRIP_TOP - 24}" font-family="Geist, system-ui, sans-serif" font-size="10" letter-spacing="2.5" fill="${PALETTE.muted}">${label}</text>`,
    );

    if (!root) continue;

    // layout this tree within its strip (with internal padding)
    const padX = 30;
    const padTop = 14;
    const padBot = 26;
    layoutTree(
      root,
      x + padX,
      STRIP_TOP + padTop,
      w - 2 * padX,
      STRIP_H - padTop - padBot,
    );

    // edges
    const allNodes = flatten(root);
    parts.push(
      `<g stroke="${PALETTE.edge}" stroke-width="1.5" fill="none" stroke-linecap="round">`,
    );
    for (const n of allNodes) {
      for (const c of n.children) {
        parts.push(`<line x1="${n.x.toFixed(1)}" y1="${n.y.toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}"/>`);
      }
    }
    parts.push(`</g>`);

    // nodes
    for (const n of allNodes) {
      const isRoot = n.depth === 0;
      const r = isRoot ? 13 : 9;
      const fill = isRoot ? accent : PALETTE.bg;
      const stroke = isRoot ? accent : accent;
      const strokeW = isRoot ? 1.5 : 1.5;
      parts.push(
        `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`,
      );
      const textFill = isRoot ? PALETTE.bg : PALETTE.ink;
      const fs = isRoot ? 12 : 10;
      parts.push(
        `<text x="${n.x.toFixed(1)}" y="${(n.y + (isRoot ? 4 : 3.5)).toFixed(1)}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="${fs}" font-weight="${isRoot ? 600 : 500}" fill="${textFill}">${escapeXml(n.label)}</text>`,
      );
    }

    // depth indicator on the right edge of strip
    const depths = root.maxDepth;
    parts.push(
      `<text x="${x + w - 6}" y="${STRIP_TOP + STRIP_H - 6}" text-anchor="end" font-family="Geist, system-ui, sans-serif" font-size="9" letter-spacing="2" fill="${PALETTE.muted}">${depths === 0 ? "STANDALONE" : `DEPTH ${depths}`}</text>`,
    );
  }

  // Bottom band: stats line + program IDs
  parts.push(
    `<line x1="60" y1="555" x2="${W - 60}" y2="555" stroke="${PALETTE.divider}" stroke-width="1"/>`,
  );
  parts.push(
    `<text x="60" y="580" font-family="Geist, system-ui, sans-serif" font-size="13" fill="${PALETTE.text}">` +
      `<tspan font-weight="600" fill="${PALETTE.ink}">Live on Solana devnet</tspan> · 4 Anchor programs · pay loyal customers, not influencers` +
      `</text>`,
  );

  // Program IDs row (mono, ellipsised)
  const pidShorts = programIds.map(
    (id) => `${id.slice(0, 6)}…${id.slice(-4)}`,
  );
  const pidLabels = ["protocol", "network", "escrow", "oracle"];
  let pxCursor = 60;
  for (let i = 0; i < pidShorts.length; i++) {
    parts.push(
      `<text x="${pxCursor}" y="606" font-family="Geist, system-ui, sans-serif" font-size="9" letter-spacing="2" fill="${PALETTE.muted}">${pidLabels[i]!.toUpperCase()}</text>`,
    );
    parts.push(
      `<text x="${pxCursor}" y="620" font-family="Consolas, ui-monospace, monospace" font-size="11" fill="${PALETTE.ink}">${escapeXml(pidShorts[i]!)}</text>`,
    );
    pxCursor += 240;
  }

  // Bottom-right: domain
  parts.push(
    `<text x="${W - 60}" y="620" text-anchor="end" font-family="Consolas, ui-monospace, monospace" font-size="11" fill="${PALETTE.muted}">conexple-pages-web.pages.dev</text>`,
  );

  parts.push(`</svg>`);
  return parts.join("\n");
}

function flatten(n: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(n);
  for (const c of n.children) flatten(c, out);
  return out;
}
function countNodes(n: TreeNode): number {
  return flatten(n).length;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const conn = new Connection(RPC, "confirmed");
  console.log(`querying ${RPC} for positions (size=${POSITION_SIZE})…`);
  const accounts = await conn.getProgramAccounts(NETWORK_PROGRAM, {
    commitment: "confirmed",
    filters: [{ dataSize: POSITION_SIZE }],
  });
  const positions: PositionView[] = [];
  for (const acc of accounts) {
    try {
      positions.push(decodePosition(acc.pubkey, acc.account.data));
    } catch {
      // skip undecodable
    }
  }
  console.log(`decoded ${positions.length} positions`);

  const labels = buildLabelMap();
  const trees = buildTrees(positions, labels);
  console.log(
    `roots: ${trees.length} | nodes per tree: ${trees.map(countNodes).join(", ")}`,
  );
  for (const t of trees) {
    console.log(`  tree ${t.label}: depth ${t.maxDepth}, ${countNodes(t)} nodes`);
  }

  // Program IDs (from env or hardcoded fallbacks matching apps/web .env.production)
  const programIds = [
    process.env.NEXT_PUBLIC_PROGRAM_PROTOCOL ??
      "D1HVppRLhT6wmUxmaM4QABytmcBDEmKuuuMoa7HkKSbn",
    process.env.NEXT_PUBLIC_PROGRAM_NETWORK ??
      "9nrHZqJcT3zLcK6eTu7ZLBBAU3Rr2eecnFYF413YePt9",
    process.env.NEXT_PUBLIC_PROGRAM_ESCROW ??
      "9eTvjKrfbYy6JhFMJnuFo5ATCN6uS115J196bvPbmMXU",
    process.env.NEXT_PUBLIC_PROGRAM_ORACLE ??
      "9CQFV9oPYKWE4Yg4w8mwJxsdibPeZJrKoTqcp2iTi1qz",
  ];

  const svg = renderSvg(trees, programIds);

  // Resolve paths from process.cwd() (pnpm scripts run from package root,
  // i.e. apps/web). Fall back gracefully if invoked from elsewhere.
  const cwd = process.cwd();
  let pubDir = path.join(cwd, "public");
  if (!fs.existsSync(pubDir)) {
    // try alpha/apps/web/public from monorepo root
    const alt = path.join(cwd, "apps", "web", "public");
    if (fs.existsSync(alt)) pubDir = alt;
  }
  if (!fs.existsSync(pubDir)) {
    throw new Error(
      `cannot find public/ dir from cwd=${cwd} (looked at ${pubDir})`,
    );
  }
  const svgPath = path.join(pubDir, "og.svg");
  const pngPath = path.join(pubDir, "og.png");

  fs.writeFileSync(svgPath, svg, "utf8");
  console.log(`wrote ${svgPath} (${svg.length} bytes)`);

  // Render PNG via @resvg/resvg-js-cli (matches v1 pipeline).
  // On Windows, spawn with shell:true requires a single quoted command
  // string — passing args separately causes the shell to re-split values
  // like "Segoe UI" into two tokens.
  console.log(`rendering ${pngPath} via @resvg/resvg-js-cli…`);
  const cmd = [
    "npx",
    "-y",
    "@resvg/resvg-js-cli@latest",
    "--font-serif-family",
    "Georgia",
    `--font-sans-serif-family`,
    `"Segoe UI"`,
    "--font-monospace-family",
    "Consolas",
    `"${svgPath}"`,
    `"${pngPath}"`,
  ].join(" ");
  const result = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`resvg-cli exited with ${result.status}`);
  }

  const pngStat = fs.statSync(pngPath);
  console.log(`✅ ${pngPath} (${pngStat.size.toLocaleString()} bytes)`);
}

main().catch((e) => {
  console.error("gen-og.ts failed:", e);
  process.exit(1);
});

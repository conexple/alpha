"use client";

import { useMemo, useState } from "react";
import type { PositionView } from "@/lib/program-clients";
import { shortenPub, solscanAccount } from "@/lib/program-clients";

interface Node extends PositionView {
  x: number;
  y: number;
  childIds: string[];
}

interface Props {
  positions: PositionView[];
  highlightWallet?: string;
}

const NODE_R = 22;
const LEVEL_H = 130;
const SIBLING_W = 110;

/**
 * SVG-rendered network tree from real on-chain Position data.
 *
 * Layout: Reingold-Tilford-ish — assign x by post-order leaf accumulation,
 * y by depth. Pure JS, no d3 dependency.
 */
export function NetworkTree({ positions, highlightWallet }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(positions), [positions]);
  if (!tree) {
    return (
      <div className="rounded-2xl border border-edge bg-paper p-12 text-center text-sm text-stone">
        No positions found in this network. Run{" "}
        <code className="rounded bg-cream px-2 py-0.5 font-mono">pnpm seed</code>.
      </div>
    );
  }

  const { nodes, edges, width, height } = tree;
  const minX = Math.min(...nodes.map((n) => n.x)) - 60;
  const maxX = Math.max(...nodes.map((n) => n.x)) + 60;
  const viewW = Math.max(width, maxX - minX);

  return (
    <div className="overflow-x-auto rounded-2xl border border-edge bg-paper p-6 shadow-soft">
      <svg
        viewBox={`${minX} 0 ${viewW} ${height + 80}`}
        className="block w-full max-w-none"
        style={{ minWidth: viewW * 0.6, height: Math.max(420, height + 80) }}
      >
        <defs>
          <linearGradient id="active-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#FBF7F1" />
            <stop offset="1" stopColor="#F4EFE6" />
          </linearGradient>
          <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
            <feOffset dy="2" />
            <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* edges */}
        <g stroke="#C7BFAF" strokeWidth="1" fill="none">
          {edges.map((e, i) => (
            <path
              key={i}
              d={`M ${e.x1} ${e.y1 + NODE_R} C ${e.x1} ${e.y1 + NODE_R + 30}, ${e.x2} ${e.y2 - NODE_R - 30}, ${e.x2} ${e.y2 - NODE_R}`}
            />
          ))}
        </g>

        {/* nodes */}
        <g>
          {nodes.map((n) => {
            const isHover = hover === n.pubkey.toBase58();
            const isHL = highlightWallet === n.wallet.toBase58();
            const fill = n.depth === 0 ? "#0E1116" : isHL ? "#9945FF" : "url(#active-grad)";
            const ring =
              n.status === "expired" ? "#D9534A" :
              n.depth === 0 ? "#0E1116" :
              isHL ? "#9945FF" :
              "#0E1116";
            const txt = n.depth === 0 || isHL ? "#FBF7F1" : "#0E1116";
            return (
              <g
                key={n.pubkey.toBase58()}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(n.pubkey.toBase58())}
                onMouseLeave={() => setHover(null)}
                onClick={() => window.open(solscanAccount(n.wallet), "_blank")}
              >
                <circle
                  r={NODE_R}
                  fill={fill}
                  stroke={ring}
                  strokeWidth={isHL || isHover ? 2 : 1}
                  filter={isHover ? "url(#soft-shadow)" : undefined}
                />
                <text
                  textAnchor="middle"
                  y="2"
                  fill={txt}
                  fontFamily="Fraunces, Georgia, serif"
                  fontSize="14"
                  fontWeight="500"
                >
                  L{n.depth}
                </text>
                <text
                  textAnchor="middle"
                  y={NODE_R + 16}
                  fill="#3B3A36"
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="10"
                >
                  {shortenPub(n.wallet)}
                </text>
                {n.cumulativeEarned > 0n && (
                  <text
                    textAnchor="middle"
                    y={NODE_R + 30}
                    fill="#5C6B3A"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="9"
                    fontWeight="500"
                  >
                    +{Number(n.cumulativeEarned)} earned
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-stone">
        <Legend color="#0E1116" label="Root" />
        <Legend color="#FBF7F1" border="#0E1116" label="Active" />
        <Legend color="#9945FF" label="Selected" />
        <Legend color="#FBF7F1" border="#D9534A" label="Expired" />
        <span className="ml-auto font-mono text-stone">
          click a node → open on Solscan
        </span>
      </div>
    </div>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-full"
        style={{ background: color, border: border ? `1px solid ${border}` : "1px solid transparent" }}
      />
      {label}
    </span>
  );
}

// ─── Tree layout (post-order subtree-width algorithm) ──────────────────────

function buildTree(positions: PositionView[]) {
  if (positions.length === 0) return null;
  const byWallet = new Map<string, Node>();
  for (const p of positions) {
    byWallet.set(p.wallet.toBase58(), {
      ...p,
      x: 0, y: 0, childIds: [],
    });
  }
  // Wire children, collect roots
  const roots: Node[] = [];
  for (const n of byWallet.values()) {
    if (n.parent) {
      const parent = byWallet.get(n.parent.toBase58());
      if (parent) parent.childIds.push(n.wallet.toBase58());
      else roots.push(n); // orphaned (parent not in slice)
    } else {
      roots.push(n);
    }
  }
  for (const n of byWallet.values()) {
    n.childIds.sort((a, b) =>
      Number(byWallet.get(a)!.joinedAt - byWallet.get(b)!.joinedAt),
    );
  }
  roots.sort((a, b) => Number(a.joinedAt - b.joinedAt));
  if (roots.length === 0) return null;

  // Walk every root with one shared cursor so trees end up side-by-side.
  let cursor = 0;
  const ROOT_GAP = 1.5;
  function layout(node: Node, depth: number): { left: number; right: number } {
    node.y = 60 + depth * LEVEL_H;
    if (node.childIds.length === 0) {
      node.x = cursor * SIBLING_W;
      cursor++;
      return { left: node.x, right: node.x };
    }
    let left = Infinity;
    let right = -Infinity;
    for (const cid of node.childIds) {
      const child = byWallet.get(cid)!;
      const span = layout(child, depth + 1);
      if (span.left < left) left = span.left;
      if (span.right > right) right = span.right;
    }
    node.x = (left + right) / 2;
    return { left, right };
  }
  for (const root of roots) {
    layout(root, 0);
    cursor += ROOT_GAP;
  }

  const nodes = Array.from(byWallet.values());
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const n of nodes) {
    if (!n.parent) continue;
    const p = byWallet.get(n.parent.toBase58());
    if (!p) continue;
    edges.push({ x1: p.x, y1: p.y, x2: n.x, y2: n.y });
  }

  const maxX = Math.max(...nodes.map((n) => n.x));
  const maxY = Math.max(...nodes.map((n) => n.y));
  return {
    nodes,
    edges,
    width: maxX + 100,
    height: maxY + 100,
    rootCount: roots.length,
  };
}

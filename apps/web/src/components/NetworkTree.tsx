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
  /**
   * Current cycle index (Network.cycleIndex) — needed to derive the "grace"
   * state. If null/undefined, falls back to active/expired only (a position
   * that's just-on-the-edge of expiry will still render as active).
   */
  currentRound?: bigint | null;
}

type NodeState = "active" | "grace" | "expired";

function deriveNodeState(p: PositionView, currentRound: bigint | null | undefined): NodeState {
  if (p.status === "expired" || p.expiredAt !== null) return "expired";
  // Without a known round, we can't distinguish grace from active. Default
  // active so we don't paint healthy nodes as "grace" by mistake.
  if (currentRound === null || currentRound === undefined) return "active";
  const behind = currentRound - p.lastPurchaseRound;
  // Rotation rule (docs/02 §11): 1 cycle grace, expire after 2 missed.
  // behind === 1 → skipped exactly one cycle, 1 more before expiry.
  if (behind === 1n) return "grace";
  return "active";
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
export function NetworkTree({ positions, highlightWallet, currentRound }: Props) {
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
    <div className="overflow-x-auto rounded-xl border border-edge bg-cream p-6">
      <svg
        viewBox={`${minX} 0 ${viewW} ${height + 80}`}
        className="block w-full max-w-none"
        style={{ minWidth: viewW * 0.6, height: Math.max(420, height + 80) }}
      >
        {/* edges */}
        <g stroke="#E4E4E7" strokeWidth="1" fill="none">
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
            const state = deriveNodeState(n, currentRound);
            const fill =
              state === "expired" ? "#E4E4E7" :
              n.depth === 0 ? "#09090B" :
              isHL ? "#9945FF" :
              "#FFFFFF";
            const ring =
              state === "expired" ? "#71717A" :
              state === "grace" ? "#F59E0B" :
              n.depth === 0 ? "#09090B" :
              isHL ? "#9945FF" :
              "#09090B";
            const txt =
              state === "expired" ? "#52525B" :
              n.depth === 0 || isHL ? "#FFFFFF" :
              "#09090B";
            const dash =
              state === "expired" ? "4 3" :
              state === "grace" ? "3 2" :
              undefined;
            const groupOpacity = state === "expired" ? 0.65 : 1;
            const tooltip =
              state === "expired" ? "Expired (rotation)" :
              state === "grace" ? "Grace (1/2)" :
              undefined;
            return (
              <g
                key={n.pubkey.toBase58()}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ cursor: "pointer", opacity: groupOpacity }}
                onMouseEnter={() => setHover(n.pubkey.toBase58())}
                onMouseLeave={() => setHover(null)}
                onClick={() => window.open(solscanAccount(n.wallet), "_blank")}
              >
                {tooltip && <title>{tooltip}</title>}
                <circle
                  r={isHover ? NODE_R + 2 : NODE_R}
                  fill={fill}
                  stroke={ring}
                  strokeWidth={isHL || isHover ? 2 : 1.5}
                  strokeDasharray={dash}
                  style={{ transition: "r 0.15s ease, stroke-width 0.15s ease" }}
                />
                <text
                  textAnchor="middle"
                  y="2"
                  fill={txt}
                  fontFamily="Geist, Inter, system-ui, sans-serif"
                  fontSize="13"
                  fontWeight="600"
                  letterSpacing="-0.02em"
                >
                  L{n.depth}
                </text>
                {/* "1/2" badge for grace state — sits top-right of the node */}
                {state === "grace" && (
                  <g transform={`translate(${NODE_R - 4}, ${-NODE_R + 4})`}>
                    <circle r="9" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1" />
                    <text
                      textAnchor="middle"
                      y="3"
                      fill="#B45309"
                      fontFamily="Geist Mono, JetBrains Mono, monospace"
                      fontSize="8"
                      fontWeight="700"
                    >
                      1/2
                    </text>
                  </g>
                )}
                <text
                  textAnchor="middle"
                  y={NODE_R + 16}
                  fill="#52525B"
                  fontFamily="Geist Mono, JetBrains Mono, monospace"
                  fontSize="10"
                >
                  {shortenPub(n.wallet)}
                </text>
                {n.cumulativeEarned > 0n && (
                  <text
                    textAnchor="middle"
                    y={NODE_R + 30}
                    fill="#10B981"
                    fontFamily="Geist Mono, JetBrains Mono, monospace"
                    fontSize="9"
                    fontWeight="600"
                  >
                    +{Number(n.cumulativeEarned)} earned
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="mt-5 flex flex-wrap gap-4 text-xs text-stone">
        <Legend color="#09090B" label="Root" />
        <Legend color="#FFFFFF" border="#09090B" label="Active" />
        <Legend color="#9945FF" label="Selected" />
        <Legend color="#FFFFFF" border="#F59E0B" dashed label="Grace (1/2)" />
        <Legend color="#E4E4E7" border="#71717A" dashed label="Expired" />
        <span className="ml-auto font-mono text-stone">
          click a node → open on Solscan
        </span>
      </div>
    </div>
  );
}

function Legend({
  color, border, label, dashed,
}: { color: string; border?: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded-full"
        style={{
          background: color,
          border: border ? `1px ${dashed ? "dashed" : "solid"} ${border}` : "1px solid transparent",
        }}
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

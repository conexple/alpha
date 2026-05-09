import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

// Networks — operator-deployed networks (V1: typically just 1).
export const networks = sqliteTable("networks", {
  id: text("id").primaryKey(),                // network PDA pubkey
  network_id: integer("network_id").notNull(),
  operator: text("operator").notNull(),
  oracle: text("oracle").notNull(),
  cycle_seconds: integer("cycle_seconds").notNull(),
  cycle_index: integer("cycle_index").notNull(),
  margin_bps: integer("margin_bps").notNull(),
  multiplier: integer("multiplier").notNull(),
  pool_split_bps: integer("pool_split_bps").notNull(),
  created_at: integer("created_at").notNull(),
});

// Position mirror — read-through cache of on-chain Position state.
// Source of truth is on-chain; this exists for fast tree traversal.
export const positions = sqliteTable(
  "positions",
  {
    network_id: text("network_id").notNull(),
    wallet: text("wallet").notNull(),
    parent: text("parent"),                    // null = unplaced root
    depth: integer("depth").notNull(),
    status: text("status").notNull(),          // active | expired
    cumulative_earned: integer("cumulative_earned").notNull().default(0),
    earnings_cap: integer("earnings_cap").notNull(),
    last_purchase_round: integer("last_purchase_round"),
    extension_locked: integer("extension_locked", { mode: "boolean" }).notNull().default(false),
    joined_at: integer("joined_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network_id, t.wallet] }),
    parent_idx: index("positions_parent").on(t.network_id, t.parent),
    status_idx: index("positions_status").on(t.network_id, t.status),
  }),
);

// Merchants
export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),                 // merchant_escrow PDA
  network_id: text("network_id").notNull(),
  merchant_id: integer("merchant_id").notNull(),
  name: text("name").notNull(),
  vault: text("vault").notNull(),
  created_at: integer("created_at").notNull(),
});

// Purchases — observable events.
export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),                // purchase pubkey or correlation id
    network_id: text("network_id").notNull(),
    merchant_id: integer("merchant_id").notNull(),
    buyer: text("buyer").notNull(),
    amount: integer("amount").notNull(),       // in USDC base units (6 decimals)
    block_time: integer("block_time").notNull(),
    round: integer("round").notNull(),
    voided: integer("voided", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    buyer_idx: index("purchases_buyer").on(t.buyer),
    round_idx: index("purchases_round").on(t.network_id, t.round),
  }),
);

// Pending commission — slot-level intermediate state before settle.
export const pending_commission = sqliteTable(
  "pending_commission",
  {
    id: text("id").primaryKey(),               // hash of (purchase_id, kind, slot)
    purchase_id: text("purchase_id").notNull(),
    network_id: text("network_id").notNull(),
    recipient: text("recipient").notNull(),
    kind: text("kind").notNull(),              // level | infinity | social_pool | operator_pool
    slot: integer("slot").notNull(),           // 0..6 (level1..5 + override + pool)
    amount: integer("amount").notNull(),
    anchor_at: integer("anchor_at").notNull(),
    settle_at: integer("settle_at").notNull(),
    status: text("status").notNull().default("pending"),  // pending | settled | voided | expired
    onchain_pending_pubkey: text("onchain_pending_pubkey"),
  },
  (t) => ({
    recipient_idx: index("pc_recipient").on(t.recipient),
    settle_at_idx: index("pc_settle_at").on(t.settle_at, t.status),
    purchase_idx: index("pc_purchase").on(t.purchase_id),
  }),
);

// Settlements — one row per submitted on-chain transaction.
export const settlements = sqliteTable(
  "settlements",
  {
    id: text("id").primaryKey(),               // tx signature
    network_id: text("network_id").notNull(),
    cycle_index: integer("cycle_index").notNull(),
    submitted_at: integer("submitted_at").notNull(),
    total_paid: integer("total_paid").notNull(),
    status: text("status").notNull(),          // submitting | settled | failed
    error: text("error"),
  },
  (t) => ({
    cycle_idx: index("settlements_cycle").on(t.network_id, t.cycle_index),
  }),
);

// Oracle signing audit log — every signature accounted for.
export const oracle_audit = sqliteTable("oracle_audit", {
  id: text("id").primaryKey(),
  signed_at: integer("signed_at").notNull(),
  caller: text("caller").notNull(),            // which Worker called sign
  ix_kind: text("ix_kind").notNull(),
  signature: text("signature").notNull(),
});

// Idempotency keys — replaces Durable Objects for V1 ordering guarantees.
export const idempotency = sqliteTable(
  "idempotency",
  {
    key: text("key").primaryKey(),             // logical operation id
    scope: text("scope").notNull(),            // placement | settlement | purchase
    created_at: integer("created_at").notNull(),
    payload: text("payload"),                  // JSON of the original request
    result: text("result"),                    // JSON of the result (if any)
  },
);

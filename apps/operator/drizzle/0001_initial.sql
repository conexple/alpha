-- 0001_initial — schema for conexple-operator D1 database.
-- Mirrors apps/operator/src/db/schema.ts.

CREATE TABLE IF NOT EXISTS networks (
  id TEXT PRIMARY KEY,
  network_id INTEGER NOT NULL,
  operator TEXT NOT NULL,
  oracle TEXT NOT NULL,
  cycle_seconds INTEGER NOT NULL,
  cycle_index INTEGER NOT NULL,
  margin_bps INTEGER NOT NULL,
  multiplier INTEGER NOT NULL,
  pool_split_bps INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  network_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  parent TEXT,
  depth INTEGER NOT NULL,
  status TEXT NOT NULL,
  cumulative_earned INTEGER NOT NULL DEFAULT 0,
  earnings_cap INTEGER NOT NULL,
  last_purchase_round INTEGER,
  extension_locked INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (network_id, wallet)
);
CREATE INDEX IF NOT EXISTS positions_parent ON positions (network_id, parent);
CREATE INDEX IF NOT EXISTS positions_status ON positions (network_id, status);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  merchant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  vault TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  merchant_id INTEGER NOT NULL,
  buyer TEXT NOT NULL,
  amount INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  round INTEGER NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS purchases_buyer ON purchases (buyer);
CREATE INDEX IF NOT EXISTS purchases_round ON purchases (network_id, round);

CREATE TABLE IF NOT EXISTS pending_commission (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  network_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,
  slot INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  anchor_at INTEGER NOT NULL,
  settle_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  onchain_pending_pubkey TEXT
);
CREATE INDEX IF NOT EXISTS pc_recipient ON pending_commission (recipient);
CREATE INDEX IF NOT EXISTS pc_settle_at ON pending_commission (settle_at, status);
CREATE INDEX IF NOT EXISTS pc_purchase ON pending_commission (purchase_id);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  cycle_index INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  total_paid INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS settlements_cycle ON settlements (network_id, cycle_index);

CREATE TABLE IF NOT EXISTS oracle_audit (
  id TEXT PRIMARY KEY,
  signed_at INTEGER NOT NULL,
  caller TEXT NOT NULL,
  ix_kind TEXT NOT NULL,
  signature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT,
  result TEXT
);

-- Drizzle migration metadata
CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO __drizzle_migrations (id, hash, created_at)
  VALUES (1, 'initial', strftime('%s', 'now'));

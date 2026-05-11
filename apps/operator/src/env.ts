// Cloudflare Workers binding shape — keep in sync with wrangler.toml.

export interface Env {
  // ── Vars (non-secret) ────────────────────────────────────────────────────
  SOLANA_CLUSTER: string;          // "devnet"
  SOLANA_RPC_FALLBACK: string;     // "https://api.devnet.solana.com"
  PROGRAM_ID_PROTOCOL: string;
  PROGRAM_ID_NETWORK: string;
  PROGRAM_ID_ESCROW: string;
  PROGRAM_ID_ORACLE: string;
  NETWORK_ID: string;              // numeric id as string
  OPERATOR_DEMO_MODE?: string;     // "true" => admin endpoints skip auth (V1 demo)

  // ── Secrets (set via `wrangler secret put`) ──────────────────────────────
  ORACLE_SECRET: string;           // base58 secret key bytes
  HELIUS_RPC_URL?: string;         // devnet RPC with API key (optional)
  PURCHASE_WEBHOOK_HMAC: string;   // shared secret with demo storefront

  // ── Bindings ─────────────────────────────────────────────────────────────
  DB: D1Database;
  RPC_CACHE: KVNamespace;
  PURCHASE_QUEUE: Queue<PurchaseQueueMessage>;
}

export interface PurchaseQueueMessage {
  network_id: string;
  merchant_id: number;
  buyer: string;
  amount: number;
  block_time: number;
  correlation_id: string;
}

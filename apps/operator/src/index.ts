import { Hono } from "hono";
import { cors } from "hono/cors";
import { Env } from "./env";
import { placementRoute } from "./workers/placement";
import { settlementRoute } from "./workers/scheduler";
import { oracleRoute } from "./workers/oracle";
import { purchaseIngestRoute } from "./workers/purchase";
import { rpcCacheRoute } from "./workers/rpc-cache";
import { merchantRoute } from "./workers/merchant";
import { runScheduledSettlement } from "./workers/scheduler";
import { handlePurchaseQueue } from "./workers/purchase";

// ── HTTP router ─────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors({ origin: "*" }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "conexple-worker-operator",
    cluster: c.env.SOLANA_CLUSTER,
    network_id: c.env.NETWORK_ID,
    time: new Date().toISOString(),
  }),
);

app.route("/placement", placementRoute);
app.route("/settle", settlementRoute);
app.route("/oracle", oracleRoute);
app.route("/webhook", purchaseIngestRoute);
app.route("/rpc", rpcCacheRoute);
app.route("/merchant", merchantRoute);

// ── Worker handler ──────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  // Cron: cycle cut-off settlement run
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledSettlement(env, event.scheduledTime));
  },

  // Queue: purchase events (consumed in batches of 25)
  async queue(batch: MessageBatch<unknown>, env: Env) {
    await handlePurchaseQueue(batch, env);
  },
} satisfies ExportedHandler<Env>;

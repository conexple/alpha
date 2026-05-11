// Oracle worker — these endpoints were originally planned for internal callers
// to delegate signing of arbitrary base64-encoded transactions to the operator's
// oracle keypair. In V1 they ended up unused: the scheduler signs inline via
// loadOracleKeypair() in the same Worker process, and no external script calls
// the HTTP version.
//
// The exposed endpoints were a serious risk: any internet caller could submit
// a Conexple-program instruction (record_purchase / add_earnings / place_member)
// and have it signed + broadcast by our oracle on devnet, forging the on-chain
// audit trail. Pre-submission security audit found this.
//
// Resolution: both endpoints return 410 Gone. Internal callers continue to use
// loadOracleKeypair() directly. Re-enable with proper HMAC auth in V2 if a
// genuine remote-signer use-case emerges.

import { Hono } from "hono";
import type { Env } from "../env";

export const oracleRoute = new Hono<{ Bindings: Env }>();

oracleRoute.post("/sign", (c) =>
  c.json(
    {
      error: "endpoint disabled",
      note: "Oracle signing happens in-process. There is no external sign API in V1.",
    },
    410,
  ),
);

oracleRoute.post("/sign-submit", (c) =>
  c.json(
    {
      error: "endpoint disabled",
      note: "Oracle sign+submit happens in-process. There is no external API in V1.",
    },
    410,
  ),
);

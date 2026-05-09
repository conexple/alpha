// Oracle worker — exposes /oracle/* endpoints for internal callers.
//
// V1 scope:
//   POST /oracle/sign         — sign a base64-encoded transaction with the
//                               operator oracle keypair, return the signed
//                               base64 transaction (caller submits)
//   POST /oracle/sign-submit  — sign + submit + return signature
//
// Both endpoints require an `x-conexple-internal` header that matches a
// shared secret derived from the operator HMAC. (V1 simplification — no
// separate signer auth.)

import { Hono } from "hono";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { Env } from "../env";
import { connection } from "../chain/connection";
import { loadOracleKeypair } from "../chain/oracle";

export const oracleRoute = new Hono<{ Bindings: Env }>();

oracleRoute.post("/sign", async (c) => {
  const body = await c.req.json<{ tx: string }>();
  const tx = Transaction.from(Buffer.from(body.tx, "base64"));
  const oracle = loadOracleKeypair(c.env);
  tx.partialSign(oracle);
  return c.json({
    signed: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    signer: oracle.publicKey.toBase58(),
  });
});

oracleRoute.post("/sign-submit", async (c) => {
  const body = await c.req.json<{ tx: string; commitment?: "processed" | "confirmed" | "finalized" }>();
  const tx = Transaction.from(Buffer.from(body.tx, "base64"));
  const oracle = loadOracleKeypair(c.env);
  const conn = connection(c.env);
  const sig = await sendAndConfirmTransaction(conn, tx, [oracle], {
    commitment: body.commitment ?? "confirmed",
  });

  // Audit log
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO oracle_audit (id, signed_at, caller, ix_kind, signature) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, Math.floor(Date.now() / 1000), "oracle/sign-submit", "any", sig)
    .run();

  return c.json({ signature: sig });
});

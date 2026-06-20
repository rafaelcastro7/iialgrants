// HMAC + timestamp + nonce verification for /api/public/hooks/*.
// Closes pen-test Issue #4 — replaces publishable-key auth with a
// signed-request scheme that is replay-resistant and not exposed to the
// browser.
//
// Headers required on every request:
//   x-iial-timestamp : unix seconds (string)
//   x-iial-nonce     : random opaque string, 16-128 chars, single-use
//   x-iial-signature : hex HMAC-SHA256 over `${ts}.${nonce}.${rawBody}`
//
// Secret: WEBHOOK_HMAC_SECRET (server-only, runtime secret).

import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SEC = 300; // ±5 minutes
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 60; // max requests per IP per endpoint per window

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function verifyWebhookRequest(
  request: Request,
  endpoint: string,
): Promise<{ result: WebhookAuthResult; rawBody: string }> {
  const rawBody = await request.text();
  const ip = clientIp(request);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Rate limit (Issue #5): per-IP per-endpoint sliding window.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
  const { count: recent, error: rlErr } = await supabaseAdmin
    .from("webhook_rate_limit")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", endpoint)
    .eq("client_ip", ip)
    .gte("seen_at", windowStart);
  if (rlErr) {
    return { result: { ok: false, status: 500, reason: `rate_limit_error:${rlErr.message}` }, rawBody };
  }
  if ((recent ?? 0) >= RATE_LIMIT_MAX) {
    return { result: { ok: false, status: 429, reason: "rate_limited" }, rawBody };
  }
  await supabaseAdmin.from("webhook_rate_limit").insert({ endpoint, client_ip: ip });
  // Best-effort GC of old rate-limit rows.
  const rlCutoff = new Date(Date.now() - 2 * RATE_LIMIT_WINDOW_SEC * 1000).toISOString();
  await supabaseAdmin.from("webhook_rate_limit").delete().lt("seen_at", rlCutoff);


  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from("webhook_config")
    .select("value")
    .eq("key", "hmac_secret")
    .maybeSingle();
  if (cfgErr || !cfg?.value) {
    return {
      result: { ok: false, status: 500, reason: "webhook_secret_not_configured" },
      rawBody,
    };
  }
  const secret = cfg.value;

  const ts = request.headers.get("x-iial-timestamp");
  const nonce = request.headers.get("x-iial-nonce");
  const sig = request.headers.get("x-iial-signature");
  if (!ts || !nonce || !sig) {
    return { result: { ok: false, status: 401, reason: "missing_signature_headers" }, rawBody };
  }
  if (nonce.length < 16 || nonce.length > 128 || !/^[A-Za-z0-9_\-]+$/.test(nonce)) {
    return { result: { ok: false, status: 401, reason: "invalid_nonce_format" }, rawBody };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { result: { ok: false, status: 401, reason: "invalid_timestamp" }, rawBody };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > TOLERANCE_SEC) {
    return { result: { ok: false, status: 401, reason: "timestamp_out_of_window" }, rawBody };
  }

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${nonce}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(sig, "hex");
  } catch {
    return { result: { ok: false, status: 401, reason: "invalid_signature_encoding" }, rawBody };
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { result: { ok: false, status: 401, reason: "signature_mismatch" }, rawBody };
  }

  // Replay protection: nonce must not have been seen before. Insert with
  // PK conflict → 401. Old rows are GC'd by the seen_at predicate below.



  // Best-effort GC: delete nonces older than 2× tolerance window.
  const cutoff = new Date(Date.now() - 2 * TOLERANCE_SEC * 1000).toISOString();
  await supabaseAdmin.from("webhook_nonces").delete().lt("seen_at", cutoff);

  const { error: insertErr } = await supabaseAdmin
    .from("webhook_nonces")
    .insert({ nonce, endpoint });
  if (insertErr) {
    // Unique-violation (23505) → replay; any other error → fail closed.
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      return { result: { ok: false, status: 401, reason: "nonce_replay" }, rawBody };
    }
    return {
      result: { ok: false, status: 500, reason: `nonce_store_error:${insertErr.message}` },
      rawBody,
    };
  }

  return { result: { ok: true }, rawBody };
}

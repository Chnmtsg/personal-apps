import Anthropic from "@anthropic-ai/sdk";
import { MODEL_ID, PROMPT_VERSION } from "../../shared/schema";
import { corsHeaders, parseAnalyzeBody, resolveOrigin, safeEqual } from "./policy";
import { runPipeline } from "./pipeline";

export interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_LIMIT_KV?: KVNamespace;
  /** Comma-separated origin allowlist. "*" disables origin checking. */
  ALLOWED_ORIGIN?: string;
  /** Optional shared secret the app sends as X-App-Key. Unset = no check. */
  APP_KEY?: string;
}

const RATE_LIMIT_PER_HOUR = 20;
// 10 KB for the entry text, plus headroom for the `history` field (client-
// computed recurring-category counts, at most one entry per category).
const MAX_BODY_BYTES = 12 * 1024;

// Give up before Cloudflare does, so a hung upstream returns a real error
// rather than a dropped connection. Applies per Anthropic call — the
// pipeline now makes up to three, so a slow entry's total wall-clock time
// can exceed this; the client's own REQUEST_TIMEOUT_MS accounts for that.
const UPSTREAM_TIMEOUT_MS = 120_000;

// Fallback when the KV namespace isn't configured yet — per-isolate only.
const memoryCounts = new Map<string, { bucket: number; count: number }>();

function json(
  allowOrigin: string | null,
  status: number,
  body: unknown
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(allowOrigin),
    },
  });
}

/**
 * `retryable` tells the client whether re-sending the same text could ever
 * succeed. Without it the app cannot distinguish a transient outage from a
 * permanently malformed entry, and retries the latter forever.
 */
function fail(
  allowOrigin: string | null,
  status: number,
  error: string,
  retryable: boolean
): Response {
  return json(allowOrigin, status, { error, retryable });
}

/**
 * Per-IP hourly budget, charged immediately before the upstream call so that
 * rejected requests never consume it.
 *
 * KV is read-then-write, so two simultaneous requests can both observe the
 * same count and overshoot the limit by one. That is acceptable here — this
 * caps sustained spend, it is not a security boundary. A hard limit would
 * need a Durable Object.
 */
async function chargeQuota(env: Env, ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 3_600_000);
  if (env.RATE_LIMIT_KV) {
    const key = `rl:${ip}:${bucket}`;
    const count = parseInt((await env.RATE_LIMIT_KV.get(key)) ?? "0", 10);
    if (count >= RATE_LIMIT_PER_HOUR) return false;
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3700 });
    return true;
  }
  const entry = memoryCounts.get(ip);
  if (!entry || entry.bucket !== bucket) {
    memoryCounts.set(ip, { bucket, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowOrigin = resolveOrigin(env.ALLOWED_ORIGIN, request.headers.get("Origin"));
    try {
      return await handle(request, env, allowOrigin);
    } catch (err) {
      // Without this the runtime answers with its own 500: no CORS grant, so
      // the browser reports a CORS failure, and no `retryable`, so the client
      // cannot tell an outage from a permanently broken entry. Reachable via
      // a client disconnect mid-body, a KV fault, or a missing API-key secret
      // — the last of which throws *after* quota has been charged.
      console.error("unhandled:", err instanceof Error ? err.constructor.name : "unknown");
      return fail(allowOrigin, 500, "internal", true);
    }
  },
};

async function handle(
  request: Request,
  env: Env,
  allowOrigin: string | null
): Promise<Response> {
  if (request.method === "OPTIONS") {
    // Preflight for a disallowed origin still answers, without the grant.
    return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
  }

  const url = new URL(request.url);

  // Unauthenticated liveness probe — useful for verifying a deploy without
  // spending a token. Reveals no configuration.
  if (request.method === "GET" && url.pathname === "/health") {
    return json(allowOrigin, 200, {
      status: "ok",
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
    });
  }

  if (request.method !== "POST" || url.pathname !== "/analyze") {
    return fail(allowOrigin, 404, "not_found", false);
  }

  // An unrecognised origin gets nothing. This is the difference between a
  // proxy your app can use and an open relay in front of a paid API key.
  if (allowOrigin === null) {
    return fail(allowOrigin, 403, "origin_not_allowed", false);
  }

  if (env.APP_KEY && !safeEqual(request.headers.get("X-App-Key") ?? "", env.APP_KEY)) {
    return fail(allowOrigin, 403, "forbidden", false);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    return fail(allowOrigin, 415, "expected_json", false);
  }

  const bytes = await request.arrayBuffer();
  const body = parseAnalyzeBody(
    new TextDecoder().decode(bytes),
    bytes.byteLength,
    MAX_BODY_BYTES
  );
  if (!body.ok) return fail(allowOrigin, body.status, body.error, false);

  // Only a request we are actually about to pay for costs quota. The
  // pipeline's internal over-rewrite retrying never charges again.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await chargeQuota(env, ip))) {
    return fail(allowOrigin, 429, "rate_limited", true);
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: UPSTREAM_TIMEOUT_MS,
  });

  const result = await runPipeline(client, body.text, body.history, body.profile, body.entryNumber);

  if (!result.ok) {
    if (result.kind === "refusal") {
      return json(allowOrigin, 200, { status: "refusal" });
    }
    // Truncation is deterministic for a given entry, so it must not be
    // sold to the client as a transient failure it should keep retrying.
    if (result.kind === "truncated") {
      return fail(allowOrigin, 502, "too_long_to_analyse", false);
    }
    return fail(allowOrigin, 502, "upstream", result.retryable);
  }

  return json(allowOrigin, 200, {
    status: "ok",
    feedback: result.value.feedback,
    model: MODEL_ID,
    promptVersion: PROMPT_VERSION,
    // From the second request onward cache.read should be > 0.
    cache: result.value.cache,
  });
}

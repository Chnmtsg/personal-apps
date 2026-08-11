import Anthropic from "@anthropic-ai/sdk";
import { MODEL_ID, PROMPT_VERSION } from "../../shared/schema.ts";
import { corsHeaders, parseAnalyzeBody, resolveOrigin, safeEqual } from "./policy";
import { runPipeline } from "./pipeline";

export interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_LIMIT_KV?: KVNamespace;
  /** Comma-separated origin allowlist. "*" disables origin checking. */
  ALLOWED_ORIGIN?: string;
  /** Optional shared secret the app sends as X-App-Key. Unset = no check. */
  APP_KEY?: string;
  /**
   * Total upstream Anthropic calls allowed per hour, across every caller. A
   * plain [vars] string (Wrangler vars arrive as strings), not a secret — a
   * limit is meant to be changed without touching code. Missing or
   * unparseable falls back to DEFAULT_GLOBAL_HOURLY_CEILING.
   */
  GLOBAL_HOURLY_CEILING?: string;
}

const RATE_LIMIT_PER_HOUR = 20;
// The one number RATE_LIMIT_PER_HOUR cannot provide: a ceiling on total spend
// regardless of how many distinct IPs are calling. A per-IP cap behind a
// forgeable Origin header is not a spend ceiling by itself. Conservative
// default for a single-learner app; raise it in wrangler.toml as real usage
// is measured.
const DEFAULT_GLOBAL_HOURLY_CEILING = 100;
// 10 KB for the entry text, plus headroom for the `history` field (client-
// computed recurring-category counts, at most one entry per category).
const MAX_BODY_BYTES = 12 * 1024;

// Give up before Cloudflare does, so a hung upstream returns a real error
// rather than a dropped connection. Applies per Anthropic call — the
// pipeline now makes up to three, so a slow entry's total wall-clock time
// can exceed this; the client's own REQUEST_TIMEOUT_MS accounts for that.
const UPSTREAM_TIMEOUT_MS = 120_000;

// Fallback when the KV namespace isn't configured yet — per-isolate only.
// Keyed by IP for the per-caller bucket, and by GLOBAL_BUCKET_KEY (chosen to
// never collide with a real "CF-Connecting-IP" value) for the global one.
const GLOBAL_BUCKET_KEY = "rl:global";
const memoryCounts = new Map<string, { bucket: number; count: number }>();

function globalHourlyCeiling(env: Env): number {
  const configured = env.GLOBAL_HOURLY_CEILING ? Number(env.GLOBAL_HOURLY_CEILING) : NaN;
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_GLOBAL_HOURLY_CEILING;
}

/**
 * Drop every in-memory bucket that is not the current hour. Without this the
 * map gains one entry per distinct IP forever, for the life of the isolate —
 * small per entry, unbounded over time (WORK-31). Called on every write, so
 * eviction rides along with normal traffic rather than needing its own timer.
 */
function evictStaleBuckets(currentBucket: number): void {
  for (const [key, entry] of memoryCounts) {
    if (entry.bucket !== currentBucket) memoryCounts.delete(key);
  }
}

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
 * Per-IP AND global hourly budgets, charged together immediately before the
 * upstream call so that a rejected request never consumes either. Both are
 * checked before either is written, so a request that would breach one limit
 * never partially charges the other.
 *
 * KV is read-then-write, so concurrent requests can both observe the same
 * count and overshoot a limit by a handful. That is acceptable here — this
 * caps sustained spend, it is not a security boundary. A hard limit would
 * need a Durable Object.
 */
async function chargeQuota(env: Env, ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 3_600_000);
  const globalLimit = globalHourlyCeiling(env);

  if (env.RATE_LIMIT_KV) {
    const ipKey = `rl:${ip}:${bucket}`;
    const globalKey = `rl:global:${bucket}`;
    const [ipRaw, globalRaw] = await Promise.all([
      env.RATE_LIMIT_KV.get(ipKey),
      env.RATE_LIMIT_KV.get(globalKey),
    ]);
    const ipCount = parseInt(ipRaw ?? "0", 10);
    const globalCount = parseInt(globalRaw ?? "0", 10);
    if (ipCount >= RATE_LIMIT_PER_HOUR || globalCount >= globalLimit) return false;
    await Promise.all([
      env.RATE_LIMIT_KV.put(ipKey, String(ipCount + 1), { expirationTtl: 3700 }),
      env.RATE_LIMIT_KV.put(globalKey, String(globalCount + 1), { expirationTtl: 3700 }),
    ]);
    return true;
  }

  evictStaleBuckets(bucket);
  const ipEntry = memoryCounts.get(ip);
  const ipCount = ipEntry && ipEntry.bucket === bucket ? ipEntry.count : 0;
  const globalEntry = memoryCounts.get(GLOBAL_BUCKET_KEY);
  const globalCount = globalEntry && globalEntry.bucket === bucket ? globalEntry.count : 0;
  if (ipCount >= RATE_LIMIT_PER_HOUR || globalCount >= globalLimit) return false;
  memoryCounts.set(ip, { bucket, count: ipCount + 1 });
  memoryCounts.set(GLOBAL_BUCKET_KEY, { bucket, count: globalCount + 1 });
  return true;
}

/**
 * Add calls the pipeline made beyond the one `chargeQuota` already approved.
 * The over-rewrite retry loop can call the model up to three times inside a
 * single already-approved request, and the global bucket only ever sees the
 * first unless this runs. Best-effort and after the fact on purpose: the
 * calls already happened, so there is nothing left to gate — only the count
 * the NEXT request's check sees needs to be right. The per-IP bucket is left
 * alone; it deliberately stays one-per-request (an abuse throttle), not a
 * spend meter.
 */
async function settleGlobalQuota(env: Env, extraCalls: number): Promise<void> {
  if (extraCalls <= 0) return;
  const bucket = Math.floor(Date.now() / 3_600_000);
  if (env.RATE_LIMIT_KV) {
    const key = `rl:global:${bucket}`;
    const current = parseInt((await env.RATE_LIMIT_KV.get(key)) ?? "0", 10);
    await env.RATE_LIMIT_KV.put(key, String(current + extraCalls), { expirationTtl: 3700 });
    return;
  }
  evictStaleBuckets(bucket);
  const entry = memoryCounts.get(GLOBAL_BUCKET_KEY);
  const count = entry && entry.bucket === bucket ? entry.count : 0;
  memoryCounts.set(GLOBAL_BUCKET_KEY, { bucket, count: count + extraCalls });
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
  // pipeline's internal over-rewrite retrying is never gated by a second
  // chargeQuota check — it settles against the global bucket afterward
  // instead (below), once the real call count is known.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await chargeQuota(env, ip))) {
    return fail(allowOrigin, 429, "rate_limited", true);
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: UPSTREAM_TIMEOUT_MS,
  });

  const result = await runPipeline(client, body.text, body.history, body.profile, body.entryNumber);

  // chargeQuota approved one call; settle whatever the retry loop spent
  // beyond that against the global bucket, win or lose — a refusal or a
  // truncation still paid for the upstream calls it took to discover that.
  await settleGlobalQuota(env, result.calls - 1);

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

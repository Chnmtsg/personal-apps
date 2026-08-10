import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  FeedbackSchema,
  TEACHING_SYSTEM_PROMPT,
  MODEL_ID,
  PROMPT_VERSION,
} from "../../shared/schema";
import { corsHeaders, parseAnalyzeBody, resolveOrigin, safeEqual } from "./policy";

export interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_LIMIT_KV?: KVNamespace;
  /** Comma-separated origin allowlist. "*" disables origin checking. */
  ALLOWED_ORIGIN?: string;
  /** Optional shared secret the app sends as X-App-Key. Unset = no check. */
  APP_KEY?: string;
}

const RATE_LIMIT_PER_HOUR = 20;
const MAX_BODY_BYTES = 10 * 1024;

// `claude-opus-5` thinks by default, and max_tokens caps thinking AND response
// text together — so this ceiling must clear both. At 8000 a long entry spent
// its budget thinking and truncated, surfacing as a permanent "incomplete".
const MAX_TOKENS = 16000;

// Give up before Cloudflare does, so a hung upstream returns a real error
// rather than a dropped connection.
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
    const text = body.text;

    // Only a request we are actually about to pay for costs quota.
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await chargeQuota(env, ip))) {
      return fail(allowOrigin, 429, "rate_limited", true);
    }

    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: UPSTREAM_TIMEOUT_MS,
    });

    let response;
    try {
      response = await client.messages.parse({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        // Explicit rather than implied: on claude-opus-5 an omitted `thinking`
        // already means adaptive, and silently relying on that default is how
        // the max_tokens budget got mis-sized in the first place.
        thinking: { type: "adaptive" },
        // Cached stable prefix — the user's text goes in messages, after it,
        // so the prefix stays byte-identical across requests.
        system: [
          {
            type: "text",
            text: TEACHING_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          effort: "medium",
          format: zodOutputFormat(FeedbackSchema),
        },
        messages: [{ role: "user", content: text }],
      });
    } catch (err) {
      // Log the error class only — never the entry text (privacy, §3.6).
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      console.error(
        "anthropic_error:",
        status ?? "no_status",
        err instanceof Error ? err.message : "unknown"
      );
      // 401/403 mean the key is wrong or lacks access — retrying cannot fix
      // it, and letting the client requeue would spin against a dead config.
      const retryable = status !== 401 && status !== 403;
      return fail(allowOrigin, 502, "upstream", retryable);
    }

    if (response.stop_reason === "refusal") {
      console.warn("refusal:", response.stop_details?.category ?? "uncategorised");
      return json(allowOrigin, 200, { status: "refusal" });
    }

    // Truncation is deterministic for a given entry, so it must not be sold to
    // the client as a transient failure it should keep retrying.
    if (response.stop_reason === "max_tokens") {
      console.error(`truncated: output exceeded max_tokens=${MAX_TOKENS}`);
      return fail(allowOrigin, 502, "too_long_to_analyse", false);
    }

    if (!response.parsed_output) {
      return fail(allowOrigin, 502, "incomplete", true);
    }

    const feedback = response.parsed_output;

    // Acceptance criterion 6: every `original` must be an exact substring of
    // the submitted text. Log the count only — not the content.
    const violations = feedback.corrections.filter((c) => !text.includes(c.original)).length;
    if (violations > 0) {
      console.warn(`substring_violations=${violations} of ${feedback.corrections.length}`);
    }

    return json(allowOrigin, 200, {
      status: "ok",
      feedback,
      model: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      // Criterion 7: from the second request onward cache.read should be > 0.
      cache: {
        read: response.usage.cache_read_input_tokens ?? 0,
        write: response.usage.cache_creation_input_tokens ?? 0,
      },
    });
  },
};

/**
 * Pure request-policy decisions for the proxy: who may call it, and what
 * counts as a well-formed request.
 *
 * Kept free of Worker runtime types and the Anthropic SDK so the rules that
 * stand between the public internet and a paid API key can be tested directly.
 */

import {
  countWords,
  ERROR_CATEGORIES,
  MIN_WORDS,
  type ErrorCategory,
  type RecurringCategory,
} from "../../shared/schema.ts";

export function allowedOrigins(configured: string | undefined): string[] {
  return (configured ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * The Access-Control-Allow-Origin value for this request, or null if the
 * origin is not allowed.
 *
 * Echoing the matched origin rather than "*" is what makes an allowlist mean
 * anything to a browser: "*" grants every site on the internet.
 */
export function resolveOrigin(
  configured: string | undefined,
  requestOrigin: string | null
): string | null {
  const allowed = allowedOrigins(configured);
  if (allowed.includes("*")) return "*";
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  return null;
}

export function corsHeaders(allowOrigin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowOrigin ?? "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Key",
    "Access-Control-Max-Age": "86400",
    // The grant varies by Origin, so caches must key on it.
    Vary: "Origin",
  };
}

/** Length-independent comparison, so a wrong key leaks nothing via timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type BodyCheck =
  | { ok: true; text: string; history: RecurringCategory[] }
  | { ok: false; status: number; error: string };

// At most one entry per category — anything past this in a request body is
// either a bug on the client or someone poking the endpoint by hand.
const MAX_HISTORY_ENTRIES = ERROR_CATEGORIES.length;

/**
 * The learner's recurring-category counts, computed client-side from their
 * own IndexedDB and sent as context for this one request — nothing is stored
 * server-side. Malformed entries are dropped rather than failing the whole
 * request: this is ranking context, not the payload the user is paying to
 * analyse.
 */
function parseHistory(raw: unknown): RecurringCategory[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(ERROR_CATEGORIES);
  const out: RecurringCategory[] = [];
  for (const item of raw) {
    if (out.length >= MAX_HISTORY_ENTRIES) break;
    if (typeof item !== "object" || item === null) continue;
    const { category, count } = item as { category?: unknown; count?: unknown };
    if (typeof category !== "string" || !known.has(category)) continue;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) continue;
    out.push({ category: category as ErrorCategory, count });
  }
  return out;
}

/**
 * Validate an /analyze payload. `byteLength` is the decoded size on the wire —
 * Content-Length is client-supplied, and String.length counts UTF-16 units,
 * which understates non-ASCII text by up to a factor of four.
 */
export function parseAnalyzeBody(
  raw: string,
  byteLength: number,
  maxBytes: number
): BodyCheck {
  if (byteLength === 0) return { ok: false, status: 400, error: "empty_body" };
  if (byteLength > maxBytes) return { ok: false, status: 413, error: "too_large" };

  let body: { text?: unknown; history?: unknown };
  try {
    body = JSON.parse(raw) as { text?: unknown; history?: unknown };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  if (typeof body.text !== "string" || !body.text.trim()) {
    return { ok: false, status: 400, error: "missing_text" };
  }
  // Defense-in-depth: the client already gates the Analyse button on
  // MIN_WORDS, but a bypassed or future client shouldn't be able to spend a
  // request on an entry too short to teach anything from.
  if (countWords(body.text) < MIN_WORDS) {
    return { ok: false, status: 400, error: "too_short" };
  }
  return { ok: true, text: body.text, history: parseHistory(body.history) };
}

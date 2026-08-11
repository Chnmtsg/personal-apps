/**
 * Pure request-policy decisions for the proxy: who may call it, and what
 * counts as a well-formed request.
 *
 * Kept free of Worker runtime types and the Anthropic SDK so the rules that
 * stand between the public internet and a paid API key can be tested directly.
 */

import {
  CEFR_LEVELS,
  countWords,
  ERROR_CATEGORIES,
  MIN_WORDS,
  type ErrorCategory,
  type LearnerProfile,
  type RecurringCategory,
} from "../../shared/schema.ts";

/**
 * An unset ALLOWED_ORIGIN yields an empty allowlist, so every browser request
 * is refused. Defaulting to "*" instead would mean any environment that lost
 * its [vars] — a dashboard-edited worker, a second environment — became an
 * open relay in front of a paid API key without anything failing loudly.
 * "*" stays available, but only when it is written down on purpose.
 */
export function allowedOrigins(configured: string | undefined): string[] {
  return (configured ?? "")
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
  | {
      ok: true;
      text: string;
      history: RecurringCategory[];
      profile?: LearnerProfile;
      entryNumber?: number;
    }
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
  const seen = new Set<string>();
  const out: RecurringCategory[] = [];
  for (const item of raw) {
    if (out.length >= MAX_HISTORY_ENTRIES) break;
    if (typeof item !== "object" || item === null) continue;
    const { category, count } = item as { category?: unknown; count?: unknown };
    if (typeof category !== "string" || !known.has(category)) continue;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) continue;
    // A repeated category would reach the synthesize prompt as several
    // separate "this keeps coming back N times" facts about one pattern.
    if (seen.has(category)) continue;
    seen.add(category);
    // The streak drives a factual claim about the learner's own history
    // ("you had four clean entries"), so a malformed one is dropped rather
    // than passed through — a wrong number here becomes a confident lie.
    const { cleanStreak } = item as { cleanStreak?: unknown };
    const streakOk =
      typeof cleanStreak === "number" && Number.isInteger(cleanStreak) && cleanStreak >= 0;
    out.push({
      category: category as ErrorCategory,
      count,
      ...(streakOk ? { cleanStreak } : {}),
    });
  }
  return out;
}

/** Field caps, matched to LearnerProfileSchema. Long enough for a real answer,
 *  short enough that nobody can smuggle a second prompt through them. */
const PROFILE_LIMITS = { nativeLanguage: 40, field: 80, goal: 120 } as const;

/**
 * The learner's own description of themselves, sent as context for this one
 * request and never stored server-side.
 *
 * Free text from the public internet that ends up inside a prompt, so it is
 * length-capped and stripped of the line breaks that would let it pose as a
 * new section of the message. A malformed field is dropped rather than
 * failing the request: this is context, not the payload being paid for.
 */
function parseProfile(raw: unknown): LearnerProfile | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { nativeLanguage, field, level, goal } = raw as Record<string, unknown>;

  const text = (value: unknown, max: number): string | undefined => {
    if (typeof value !== "string") return undefined;
    const cleaned = value.replace(/\s+/g, " ").trim().slice(0, max);
    return cleaned ? cleaned : undefined;
  };

  const profile: LearnerProfile = {
    nativeLanguage: text(nativeLanguage, PROFILE_LIMITS.nativeLanguage),
    field: text(field, PROFILE_LIMITS.field),
    goal: text(goal, PROFILE_LIMITS.goal),
    level:
      typeof level === "string" && (CEFR_LEVELS as readonly string[]).includes(level)
        ? (level as LearnerProfile["level"])
        : undefined,
  };

  const empty =
    !profile.nativeLanguage && !profile.field && !profile.goal && !profile.level;
  return empty ? undefined : profile;
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

  let body: { text?: unknown; history?: unknown; profile?: unknown; entryNumber?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
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
  // How many analysed entries came before this one — lets the teacher welcome
  // a first entry. Ranking context only; malformed is dropped, not fatal.
  const entryNumber =
    typeof body.entryNumber === "number" &&
    Number.isInteger(body.entryNumber) &&
    body.entryNumber >= 1 &&
    body.entryNumber <= 1_000_000
      ? body.entryNumber
      : undefined;
  // The key is omitted rather than set to undefined when there is no profile,
  // so "no profile" is one shape everywhere instead of two.
  const profile = parseProfile(body.profile);
  return {
    ok: true,
    text: body.text,
    history: parseHistory(body.history),
    ...(profile ? { profile } : {}),
    ...(entryNumber !== undefined ? { entryNumber } : {}),
  };
}

// The /level and /review payload parsers were removed with their routes when
// the pipeline collapsed to a single agent — see docs/adr/0001. They return
// with those agents.

import { FeedbackSchema, type Feedback, type RecurringCategory } from "../../../shared/schema";
import type { AnalyzeFailure } from "./failure";

// Trailing slashes are stripped so a URL ending in "/" can't produce "//analyze".
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

// Optional shared secret, matched against the worker's APP_KEY. It ships in a
// public bundle, so it deters casual abuse rather than authenticating anyone.
const APP_KEY = import.meta.env.VITE_APP_KEY as string | undefined;

// The worker allows itself 120s per Anthropic call, and the pipeline can now
// make up to four sequentially in the worst case (up to 3 corrector attempts
// on an over-rewrite, then synthesize — coach runs in parallel and never
// extends this). Give it a little more than that worst case so a slow-but-
// succeeding analysis is not cut short by the client, but a hung socket
// still ends. This worst case is theoretical, not measured — see the
// multi-call latency note in Known Gaps.
const REQUEST_TIMEOUT_MS = 540_000;

export type { AnalyzeFailure, AnalyzeFailureKind } from "./failure";

export type AnalyzeResult =
  | { ok: true; feedback: Feedback; model: string; promptVersion: number }
  | AnalyzeFailure;

export async function analyzeText(
  text: string,
  history: RecurringCategory[] = []
): Promise<AnalyzeResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(APP_KEY ? { "X-App-Key": APP_KEY } : {}),
      },
      // `history` is the learner's own recurring-category counts, computed
      // from local entries (getRecurringCategories) — request-scoped context
      // for ranking, never stored server-side.
      body: JSON.stringify({ text, history }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Offline, DNS failure, CORS rejection, or our own timeout.
    return { ok: false, kind: "network", retryable: true };
  }

  if (!res.ok) {
    // The worker reports whether a retry could ever help. Fall back to the
    // status class only when it didn't (e.g. an edge error page).
    const body = await res.json().catch(() => null);
    const reported = (body as { retryable?: unknown; error?: unknown } | null) ?? {};
    const retryable =
      typeof reported.retryable === "boolean" ? reported.retryable : res.status >= 500;
    const code = typeof reported.error === "string" ? reported.error : undefined;
    if (res.status === 429) return { ok: false, kind: "rate_limited", retryable: true, code };
    return { ok: false, kind: "server", retryable, code };
  }

  let data: { status?: string; feedback?: unknown; model?: string; promptVersion?: number };
  try {
    data = await res.json();
  } catch {
    return { ok: false, kind: "server", retryable: true, code: "unreadable_response" };
  }

  // A refusal is a verdict on this text, not a fault — never retry it.
  if (data.status === "refusal") return { ok: false, kind: "refusal", retryable: false };

  // Validate against the shared schema so no free-text categories can ever
  // reach storage (§3.5, criterion 5).
  const parsed = FeedbackSchema.safeParse(data.feedback);
  if (!parsed.success) {
    return { ok: false, kind: "server", retryable: true, code: "schema_mismatch" };
  }

  // The worker builds `original` from a diff against the submitted text
  // (worker/src/diff.ts), so this should never fire — kept as a cheap
  // regression guard rather than an active risk.
  for (const c of parsed.data.corrections) {
    if (!text.includes(c.original)) {
      console.warn("correction.original is not a substring of the entry text:", c.original);
    }
  }

  return {
    ok: true,
    feedback: parsed.data,
    model: data.model ?? "unknown",
    promptVersion: data.promptVersion ?? 0,
  };
}

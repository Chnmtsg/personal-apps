/**
 * The shape of a failed analysis.
 *
 * Kept apart from api.ts so the retry policy — and its tests — depend on the
 * failure taxonomy alone, not on the browser-only HTTP client that produces it.
 */

export type AnalyzeFailureKind = "refusal" | "rate_limited" | "server" | "network";

export interface AnalyzeFailure {
  ok: false;
  kind: AnalyzeFailureKind;
  /** False when re-sending the same text can never succeed. */
  retryable: boolean;
  /** Worker error code, when it supplied one. Diagnostics only. */
  code?: string;
}

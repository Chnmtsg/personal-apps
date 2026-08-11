import type { AnalyzeFailure } from "./failure";
import type { Entry } from "./db";

/**
 * How many transient failures an entry absorbs before it is dead-lettered.
 *
 * Without a ceiling, a request that fails the same way every time is retried
 * on every launch and every reconnect forever — consuming the hourly quota
 * and real API spend to produce the same failure.
 */
export const MAX_ATTEMPTS = 5;

export interface FailureOutcome {
  status: Entry["status"];
  failReason?: Entry["failReason"];
  attempts: number;
}

/**
 * Decide what happens to an entry after a failed analysis. Pure, so the
 * retry policy can be tested without a network or a database.
 */
export function applyFailure(attempts: number, failure: AnalyzeFailure): FailureOutcome {
  if (failure.kind === "refusal") {
    return { status: "failed", failReason: "refusal", attempts };
  }

  if (!failure.retryable) {
    // "too_long_to_analyse" is Anthropic rejecting the request; "too_large" is
    // policy.ts rejecting an oversized body before it is ever sent. Both are
    // the same verdict on the learner's text, and only one of them has a
    // message that tells them what to do about it.
    const tooLong = failure.code === "too_long_to_analyse" || failure.code === "too_large";
    return {
      status: "failed",
      failReason: tooLong ? "too_long" : "rejected",
      attempts,
    };
  }

  // Rate limiting is expected and self-clearing. Charging it to the retry
  // budget would let one busy hour dead-letter a whole batch of good entries.
  if (failure.kind === "rate_limited") {
    return { status: "queued", attempts };
  }

  const next = attempts + 1;
  if (next >= MAX_ATTEMPTS) {
    return { status: "failed", failReason: "gave_up", attempts: next };
  }
  return { status: "queued", attempts: next };
}

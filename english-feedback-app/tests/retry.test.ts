import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFailure, MAX_ATTEMPTS } from "../app/src/lib/retry.ts";
import type { AnalyzeFailure } from "../app/src/lib/failure.ts";

const refusal: AnalyzeFailure = { ok: false, kind: "refusal", retryable: false };
const rateLimited: AnalyzeFailure = { ok: false, kind: "rate_limited", retryable: true };
const network: AnalyzeFailure = { ok: false, kind: "network", retryable: true };
const serverDown: AnalyzeFailure = { ok: false, kind: "server", retryable: true };
const rejected: AnalyzeFailure = {
  ok: false,
  kind: "server",
  retryable: false,
  code: "missing_text",
};
const tooLong: AnalyzeFailure = {
  ok: false,
  kind: "server",
  retryable: false,
  code: "too_long_to_analyse",
};
const tooLarge: AnalyzeFailure = {
  ok: false,
  kind: "server",
  retryable: false,
  code: "too_large",
};

test("a refusal is final and does not spend an attempt", () => {
  assert.deepEqual(applyFailure(0, refusal), {
    status: "failed",
    failReason: "refusal",
    attempts: 0,
  });
});

test("a permanently rejected request fails immediately", () => {
  assert.deepEqual(applyFailure(0, rejected), {
    status: "failed",
    failReason: "rejected",
    attempts: 0,
  });
});

test("truncation is reported as too_long rather than a generic rejection", () => {
  assert.equal(applyFailure(0, tooLong).failReason, "too_long");
});

// The bug this guards: policy.ts's own "too_large" (an oversized request body
// rejected before ever reaching the model) fell through to the generic
// "rejected" reason, which tells the learner nothing they can act on, while
// the accurate "too long, try splitting it" message already existed for the
// sibling case above.
test("an oversized request body is reported as too_long, not a generic rejection", () => {
  assert.equal(applyFailure(0, tooLarge).failReason, "too_long");
});

test("rate limiting requeues without spending an attempt", () => {
  // Otherwise a burst of entries in one hour would exhaust each other's retry
  // budget and dead-letter perfectly good writing.
  for (const attempts of [0, 3, MAX_ATTEMPTS + 10]) {
    assert.deepEqual(applyFailure(attempts, rateLimited), { status: "queued", attempts });
  }
});

test("transient failures requeue and count up", () => {
  assert.deepEqual(applyFailure(0, network), { status: "queued", attempts: 1 });
  assert.deepEqual(applyFailure(1, serverDown), { status: "queued", attempts: 2 });
});

test("the entry is dead-lettered once attempts reach the ceiling", () => {
  const outcome = applyFailure(MAX_ATTEMPTS - 1, network);
  assert.deepEqual(outcome, {
    status: "failed",
    failReason: "gave_up",
    attempts: MAX_ATTEMPTS,
  });
});

test("a repeatedly failing entry always terminates", () => {
  // The bug this guards: every failure was retryable, so a deterministic
  // error was re-sent on every launch and every reconnect forever.
  let attempts = 0;
  let status = "queued";
  for (let i = 0; i < MAX_ATTEMPTS * 3 && status === "queued"; i++) {
    const outcome = applyFailure(attempts, serverDown);
    attempts = outcome.attempts;
    status = outcome.status;
  }
  assert.equal(status, "failed");
  assert.equal(attempts, MAX_ATTEMPTS);
});

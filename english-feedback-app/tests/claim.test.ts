import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeClaim,
  canClaim,
  canRequeue,
  isStaleClaim,
  mergeAnalysisResult,
  releaseStaleClaim,
} from "../app/src/lib/claim.ts";
import { MAX_ATTEMPTS } from "../app/src/lib/retry.ts";
import type { Entry } from "../app/src/lib/db.ts";
import type { Feedback } from "../shared/schema.ts";

const feedback = { corrections: [], patterns: [] } as unknown as Feedback;

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    createdAt: 1_700_000_000_000,
    text: "some writing",
    wordCount: 40,
    status: "queued",
    feedback: null,
    attempts: 0,
    ...over,
  };
}

test("only a queued entry can be claimed", () => {
  assert.equal(canClaim(entry({ status: "queued" })), true);
  assert.equal(canClaim(entry({ status: "analysing" })), false);
  assert.equal(canClaim(entry({ status: "analysed" })), false);
  assert.equal(canClaim(entry({ status: "failed" })), false);
  assert.equal(canClaim(undefined), false);
});

test("a claim is stale only once it is older than the limit", () => {
  const now = 1_000_000;
  const held = entry({ status: "analysing", analysingSince: now - 60_000 });
  assert.equal(isStaleClaim(held, now, 120_000), false, "still within the limit");
  assert.equal(isStaleClaim(held, now, 60_000), true, "exactly at the limit is stale");
  assert.equal(isStaleClaim(held, now, 30_000), true, "past the limit");
});

test("a claim with no timestamp is stale, so it can never strand an entry", () => {
  const held = entry({ status: "analysing" });
  assert.equal(isStaleClaim(held, 1_000_000, 60_000), true);
});

test("only a held claim is reclaimable — queued and finished entries are left alone", () => {
  const now = 1_000_000;
  for (const status of ["queued", "analysed", "failed"] as const) {
    assert.equal(isStaleClaim(entry({ status }), now, 1), false, status);
  }
});

// The bug this caught: both writers stored `{...snapshot, ...outcome}` from a
// snapshot read up to nine minutes earlier, which still carried
// feedback: null — so the slower runner erased a finished analysis, and if its
// patch was "gave_up" the analysis was gone for good.
test("a stored analysis is never overwritten by a later failure", () => {
  const stored = entry({ status: "analysed", feedback });
  assert.equal(
    mergeAnalysisResult(stored, { status: "failed", failReason: "gave_up" }, undefined),
    null
  );
  assert.equal(mergeAnalysisResult(stored, { status: "queued" }, undefined), null);
});

test("a fresh analysis may replace an earlier one", () => {
  const stored = entry({ status: "analysed", feedback: null });
  const merged = mergeAnalysisResult(stored, { status: "analysed", feedback }, undefined);
  assert.equal(merged?.feedback, feedback);
});

test("finishing an analysis releases the claim", () => {
  const stored = entry({ status: "analysing", analysingSince: 12345 });
  const merged = mergeAnalysisResult(
    stored,
    { status: "failed", failReason: "gave_up" },
    12345
  );
  assert.ok(merged);
  assert.equal("analysingSince" in merged, false);
});

test("a successful analysis clears a failure reason left from an earlier try", () => {
  const stored = entry({ status: "analysing", analysingSince: 7, failReason: "gave_up" });
  const merged = mergeAnalysisResult(stored, { status: "analysed", feedback }, 7);
  assert.ok(merged);
  assert.equal("failReason" in merged, false);
});

// A phone freezes a backgrounded tab while the clock keeps running, so a
// runner can wake up holding a claim that was reclaimed and handed to someone
// else. Writing then would release the *new* holder's claim mid-analysis, and
// the entry would be picked up and paid for a third time.
test("a runner whose claim was reclaimed writes nothing at all", () => {
  const heldByAnother = entry({ status: "analysing", analysingSince: 900 });
  assert.equal(
    mergeAnalysisResult(heldByAnother, { status: "queued", attempts: 1 }, 100),
    null,
    "the woken runner's token is stale"
  );
  const stillMine = mergeAnalysisResult(
    heldByAnother,
    { status: "queued", attempts: 1 },
    900
  );
  assert.ok(stillMine, "the current holder may still write");
});

// The bug this caught: releasing a claim did not spend the retry budget, so
// an entry whose analysis reliably kills the tab was reclaimed, retried and
// killed again on every launch — billing each time, never reaching the
// ceiling, because it never returned through the normal failure path.
test("releasing a stale claim costs an attempt", () => {
  const released = releaseStaleClaim(entry({ status: "analysing", attempts: 1 }));
  assert.equal(released.status, "queued");
  assert.equal(released.attempts, 2);
  assert.equal("analysingSince" in released, false);
});

test("a claim released for the last time dead-letters instead of looping", () => {
  const released = releaseStaleClaim(
    entry({ status: "analysing", attempts: MAX_ATTEMPTS - 1 })
  );
  assert.equal(released.status, "failed");
  assert.equal(released.failReason, "gave_up");
  assert.equal(released.attempts, MAX_ATTEMPTS);
});

// The gap this closes: "checking now" lived only in component state, so a tab
// switch mid-analysis came back to a Write screen that showed nothing at all
// for a wait of up to nine minutes.
test("a live claim is visible as the active analysis", () => {
  const now = 1_000_000;
  const held = entry({ status: "analysing", analysingSince: now - 60_000 });
  assert.equal(activeClaim([entry(), held, entry({ status: "analysed" })], now, 120_000), held);
});

test("with several live claims the most recently taken one wins", () => {
  const now = 1_000_000;
  const older = entry({ id: "a", status: "analysing", analysingSince: now - 90_000 });
  const newer = entry({ id: "b", status: "analysing", analysingSince: now - 10_000 });
  assert.equal(activeClaim([older, newer], now, 120_000), newer);
  assert.equal(activeClaim([newer, older], now, 120_000), newer, "regardless of order");
});

test("a stale claim shows no active analysis — nobody is doing that work", () => {
  const now = 1_000_000;
  const abandoned = entry({ status: "analysing", analysingSince: now - 200_000 });
  assert.equal(activeClaim([abandoned], now, 120_000), null);
  assert.equal(activeClaim([entry({ status: "analysing" })], now, 120_000), null, "no timestamp");
  assert.equal(activeClaim([], now, 120_000), null);
});

// The bug this guards: nothing anywhere moved a failed entry back to queued,
// so five transient failures made the writing permanently un-analysable.
test("a transient failure can be sent back to the queue, a verdict cannot", () => {
  assert.equal(canRequeue(entry({ status: "failed", failReason: "gave_up" })), true);
  for (const failReason of ["refusal", "rejected", "too_long"] as const) {
    assert.equal(
      canRequeue(entry({ status: "failed", failReason })),
      false,
      `${failReason} is a verdict on the text, not a transient failure`
    );
  }
  assert.equal(canRequeue(entry({ status: "analysed", feedback })), false);
});

test("entries that failed before reasons were recorded can be retried too", () => {
  // These predate failure classification, so they are transient failures that
  // have been stuck the longest — excluding them would leave the entries the
  // requeue path exists for as the only ones it cannot reach.
  assert.equal(canRequeue(entry({ status: "failed", failReason: "server" })), true);
  assert.equal(canRequeue(entry({ status: "failed", failReason: undefined })), true);
});

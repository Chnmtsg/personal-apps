import type { Entry } from "./db";
import { MAX_ATTEMPTS } from "./retry.ts";

/**
 * The rules that decide who owns an entry while it is being analysed.
 *
 * These live apart from `db.ts` because they are the correctness-critical
 * part: `db.ts` only supplies the transaction that makes them atomic. Kept
 * free of any runtime import from IndexedDB so they can be tested under bare
 * Node, which is where the interesting cases are — two runners racing, a
 * result arriving after another one already landed, a claim whose holder is
 * gone.
 */

/**
 * How long a claim may sit before another runner may take it. Comfortably
 * past the client's own request timeout, so this only ever releases a claim
 * whose holder is genuinely gone — a closed tab, a killed PWA — rather than
 * one that is merely slow.
 */
export const STALE_CLAIM_MS = 15 * 60_000;

/** Only a queued entry is free to take. */
export function canClaim(entry: Entry | undefined): boolean {
  return entry?.status === "queued";
}

/**
 * Whether a claim has been held so long that its holder is presumed gone —
 * a closed tab, a killed PWA. A claim with no timestamp predates the field
 * and is stale by definition; without that, such an entry would sit claimed
 * forever and never be analysed again.
 */
export function isStaleClaim(entry: Entry, now: number, maxAgeMs: number): boolean {
  if (entry.status !== "analysing") return false;
  return (entry.analysingSince ?? 0) <= now - maxAgeMs;
}

/**
 * The record to store when a stale claim is released.
 *
 * Releasing costs an attempt. Without that, an entry whose analysis reliably
 * hangs or kills the tab is reclaimed, retried, and hangs again on every
 * launch forever — billing each time and never reaching MAX_ATTEMPTS, because
 * it never returns through the normal failure path at all.
 */
export function releaseStaleClaim(entry: Entry): Entry {
  const attempts = (entry.attempts ?? 0) + 1;
  const released: Entry = { ...entry, attempts };
  delete released.analysingSince;
  if (attempts >= MAX_ATTEMPTS) {
    released.status = "failed";
    released.failReason = "gave_up";
  } else {
    released.status = "queued";
  }
  return released;
}

/**
 * The entry currently being analysed under a live claim, or null.
 *
 * This is what lets the Write screen say an analysis is running: the in-flight
 * promise is component state and dies with a tab switch, but the claim is
 * stored, so deriving "checking now" from it survives any remount. A stale
 * claim is excluded deliberately — nobody is holding it, and showing
 * "checking" for it would tell the learner work is happening when it is not.
 */
export function activeClaim(entries: Entry[], now: number, maxAgeMs: number): Entry | null {
  let latest: Entry | null = null;
  for (const entry of entries) {
    if (entry.status !== "analysing" || isStaleClaim(entry, now, maxAgeMs)) continue;
    if (!latest || (entry.analysingSince ?? 0) > (latest.analysingSince ?? 0)) latest = entry;
  }
  return latest;
}

export type AnalysisPatch = Partial<Entry> & { status: Entry["status"] };

/**
 * The record to store when an analysis finishes, or null to leave what is
 * stored alone.
 *
 * The patch is applied to the entry as it is *now*, never to the snapshot the
 * caller started with — that snapshot is up to nine minutes old and still
 * carries `feedback: null`, so writing it back would erase a finished
 * analysis. A stored analysis is never downgraded either: if two runners
 * raced anyway, feedback the learner can read beats a tidy status.
 *
 * `claimedAt` is the token the caller was given when it claimed the entry. A
 * runner whose claim was reclaimed while it was frozen — a backgrounded phone
 * keeps advancing the clock but stops running the page — comes back holding a
 * token that no longer matches, and must write nothing at all: its patch would
 * otherwise release the claim of whoever is analysing the entry right now, and
 * that entry would then be picked up and paid for a third time.
 */
export function mergeAnalysisResult(
  current: Entry,
  patch: AnalysisPatch,
  claimedAt: number | undefined
): Entry | null {
  if (current.status === "analysed" && patch.status !== "analysed") return null;
  if (current.status === "analysing" && current.analysingSince !== claimedAt) return null;
  const next: Entry = { ...current, ...patch };
  delete next.analysingSince;
  // A successful analysis clears any reason left over from an earlier failure.
  if (next.status === "analysed") delete next.failReason;
  return next;
}

/**
 * Whether the learner may send a failed entry back to the queue.
 *
 * A refusal, a rejected request and an over-long entry are verdicts on the
 * text itself, so retrying them spends money to receive the same answer. Five
 * transient failures in a row say nothing about the writing, and without a way
 * back that writing can never be analysed by any route.
 *
 * "server", and a missing reason, are what entries stored before failures were
 * classified carry (see `Entry.failReason`). Those are transient failures too,
 * and they are precisely the entries that have been stuck the longest.
 */
export function canRequeue(entry: Entry): boolean {
  if (entry.status !== "failed") return false;
  return (
    entry.failReason === "gave_up" ||
    entry.failReason === "server" ||
    entry.failReason === undefined
  );
}

import { openDB, type DBSchema } from "idb";
import {
  LearnerProfileSchema,
  type Feedback,
  type LearnerProfile,
} from "../../../shared/schema.ts";
import { TAXONOMY_VERSION } from "../../../shared/taxonomy.ts";
import {
  canClaim,
  canRequeue,
  isStaleClaim,
  mergeAnalysisResult,
  releaseStaleClaim,
  type AnalysisPatch,
} from "./claim.ts";
import { planImport, type ImportOutcome } from "./importEntries.ts";

export interface Entry {
  id: string;
  createdAt: number;
  text: string;
  wordCount: number;
  /**
   * "analysing" is a claim, not just a label: an entry carries it for the
   * duration of one analysis so no second runner — another tab, or the queue
   * firing on an `online` event mid-submit — can start the same entry again
   * and later write its own stale snapshot over the finished result.
   *
   * Entries stored before the claim existed only ever carry the other three.
   */
  status: "queued" | "analysing" | "analysed" | "failed";
  feedback: Feedback | null;
  /**
   * When the current claim was taken. A tab killed mid-analysis leaves the
   * claim behind with nobody holding it, so it is reclaimed by age.
   */
  analysingSince?: number;
  // Stored alongside each entry so historical feedback stays interpretable
  // after the model or prompt changes (§13).
  modelId?: string;
  promptVersion?: number;
  /**
   * The `TAXONOMY_VERSION` (shared/taxonomy.ts) in force when this entry was
   * analysed. Absent means "written before the marker existed" — never
   * backfilled. The last defence of the "renaming a category rewrites
   * history" invariant: a future taxonomy v3 can tell a v2-labelled entry
   * from a pre-v2 one instead of guessing from `promptVersion`.
   */
  taxonomyVersion?: number;
  /**
   * How many transient failures this entry has absorbed. Absent on entries
   * written before retry accounting existed, which read as 0.
   */
  attempts?: number;
  /**
   * "server" only appears on entries stored before failures were classified.
   */
  failReason?: "refusal" | "rejected" | "too_long" | "gave_up" | "server";
}

interface AppDB extends DBSchema {
  entries: {
    key: string;
    value: Entry;
    indexes: { "by-createdAt": number; "by-status": Entry["status"] };
  };
  meta: {
    key: string;
    value: string;
  };
}

/**
 * Thrown when the browser will not give us IndexedDB at all — private
 * browsing, a blocked upgrade, or an exhausted quota. Screens catch this and
 * say so, rather than waiting on a promise that will never resolve.
 */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Local storage is unavailable in this browser.");
    this.name = "StorageUnavailableError";
    this.cause = cause;
  }
}

/**
 * Thrown when a schema upgrade cannot run because an older tab still holds
 * the database open. Kept distinct from plain unavailability because this is
 * the one storage failure the learner can fix themselves: close the other
 * tab and reload.
 */
export class StorageBlockedError extends StorageUnavailableError {
  constructor() {
    super();
    this.name = "StorageBlockedError";
    this.message = "Another open tab is blocking a storage update.";
  }
}

// `blocked` cannot reject openDB's own promise, it can only observe — so the
// open is raced against a promise the blocked callback rejects. Without this,
// a blocked upgrade leaves openDB pending forever and every screen sits on
// its blank loading branch with no way to know why. It can only fire once the
// schema version below is bumped past what an old open tab holds.
let reportBlocked: (err: StorageBlockedError) => void = () => {};
const openBlocked = new Promise<never>((_, reject) => {
  reportBlocked = reject;
});

const dbPromise = Promise.race([
  openDB<AppDB>("english-feedback", 2, {
    // Runs once per device, resuming from whatever version is on disk — so
    // each step must be guarded by the version that introduced it, never
    // unconditional. An unguarded createObjectStore throws for every device
    // upgrading from a version that already has the store.
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const entries = db.createObjectStore("entries", { keyPath: "id" });
        entries.createIndex("by-createdAt", "createdAt");
        db.createObjectStore("meta");
      }
      // Index only — no entry is touched, so this is safe with data already
      // on disk. Lets the queue and the Write screen's poll ask IndexedDB for
      // "queued" / "analysing" entries directly instead of scanning every
      // entry on every poll.
      if (oldVersion < 2) {
        transaction.objectStore("entries").createIndex("by-status", "status");
      }
    },
    blocked() {
      console.warn("IndexedDB upgrade blocked by another open tab.");
      reportBlocked(new StorageBlockedError());
    },
    terminated() {
      console.error("IndexedDB connection was terminated unexpectedly.");
    },
  }),
  openBlocked,
]).catch((err) => {
  console.error("IndexedDB unavailable:", err);
  throw err instanceof StorageUnavailableError ? err : new StorageUnavailableError(err);
});

// The rejection above is only observed when a caller awaits the database. Tail
// it here so a browser that has no IndexedDB doesn't log an unhandled
// rejection before the first screen mounts.
void dbPromise.catch(() => {});

export async function saveEntry(entry: Entry): Promise<void> {
  const db = await dbPromise;
  await db.put("entries", entry);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  const db = await dbPromise;
  return db.get("entries", id);
}

/** Every entry, newest first. */
export async function getEntries(): Promise<Entry[]> {
  const db = await dbPromise;
  const all = await db.getAllFromIndex("entries", "by-createdAt");
  return all.reverse();
}

export async function getQueuedEntries(): Promise<Entry[]> {
  const db = await dbPromise;
  return db.getAllFromIndex("entries", "by-status", "queued");
}

/** Entries currently under a claim. Lets the Write screen's poll ask for
 * exactly the entries `activeClaim` needs, rather than reading every entry in
 * the store on every tick. */
export async function getAnalysingEntries(): Promise<Entry[]> {
  const db = await dbPromise;
  return db.getAllFromIndex("entries", "by-status", "analysing");
}

/**
 * Take the claim on an entry, returning it only if this caller won.
 *
 * The read and the write share one readwrite transaction, and IndexedDB
 * serialises those across every tab on the origin — so this is a real lock,
 * not a check followed by a hopeful write. Exactly one runner can move an
 * entry out of "queued"; the loser gets null and skips it rather than paying
 * to analyse the same text a second time. The decision itself is in
 * `claim.ts`, where it can be tested.
 */
export async function claimForAnalysis(id: string): Promise<Entry | null> {
  const db = await dbPromise;
  const tx = db.transaction("entries", "readwrite");
  const entry = await tx.store.get(id);
  if (!entry || !canClaim(entry)) {
    await tx.done;
    return null;
  }
  const claimed: Entry = { ...entry, status: "analysing", analysingSince: Date.now() };
  await tx.store.put(claimed);
  await tx.done;
  return claimed;
}

/**
 * Store the result of an analysis. `claimedAt` is the token from the entry
 * this caller claimed. See `mergeAnalysisResult` for the rules.
 */
export async function finishAnalysis(
  id: string,
  patch: AnalysisPatch,
  claimedAt: number | undefined
): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction("entries", "readwrite");
  const current = await tx.store.get(id);
  // Stamped here, once, rather than by each caller (Write.tsx, queue.ts) — the
  // single place a successful result is written is the single place its
  // taxonomy version can never be forgotten or drift between the two.
  const stamped: AnalysisPatch =
    patch.status === "analysed" ? { ...patch, taxonomyVersion: TAXONOMY_VERSION } : patch;
  const next = current ? mergeAnalysisResult(current, stamped, claimedAt) : null;
  if (next) await tx.store.put(next);
  await tx.done;
}

/**
 * Return claims nobody is holding to the queue. A tab closed or killed
 * mid-analysis leaves an entry claimed forever otherwise, and an entry that
 * is never picked up again is an entry silently lost.
 *
 * Reads happen in two passes rather than one long-held transaction: a cheap
 * read-only pass over the "analysing" index finds candidates, and a readwrite
 * transaction only opens when at least one is actually stale — the common
 * case is nothing to reclaim, and every earlier poll should not pay for a
 * write lock. Each candidate is re-read INSIDE the write transaction before
 * being released, so a claim that finished (or was already reclaimed) in the
 * gap between the two passes is never stomped with a stale snapshot.
 */
export async function reclaimStaleAnalysing(maxAgeMs: number): Promise<number> {
  const db = await dbPromise;
  const candidates = await db.getAllFromIndex("entries", "by-status", "analysing");
  const staleIds = candidates
    .filter((entry) => isStaleClaim(entry, Date.now(), maxAgeMs))
    .map((entry) => entry.id);
  if (staleIds.length === 0) return 0;

  const tx = db.transaction("entries", "readwrite");
  let reclaimed = 0;
  for (const id of staleIds) {
    const entry = await tx.store.get(id);
    if (!entry || !isStaleClaim(entry, Date.now(), maxAgeMs)) continue;
    await tx.store.put(releaseStaleClaim(entry));
    reclaimed++;
  }
  await tx.done;
  return reclaimed;
}

/** Put a dead-lettered entry back in the queue with a fresh retry budget. */
export async function requeueFailedEntry(id: string): Promise<boolean> {
  const db = await dbPromise;
  const tx = db.transaction("entries", "readwrite");
  const entry = await tx.store.get(id);
  if (!entry || !canRequeue(entry)) {
    await tx.done;
    return false;
  }
  const requeued: Entry = { ...entry, status: "queued", attempts: 0 };
  delete requeued.failReason;
  await tx.store.put(requeued);
  await tx.done;
  return true;
}

// --- Draft autosave (never lose an entry, §3.3) ---

export async function saveDraft(text: string): Promise<void> {
  const db = await dbPromise;
  await db.put("meta", text, "draft");
}

export async function getDraft(): Promise<string> {
  const db = await dbPromise;
  return (await db.get("meta", "draft")) ?? "";
}

export async function clearDraft(): Promise<void> {
  const db = await dbPromise;
  await db.delete("meta", "draft");
}

// --- Learner profile ---
//
// Stored in `meta` as JSON rather than as its own store, so it needs no
// schema version bump. It is sent as context with each analysis and, like
// everything else here, never leaves the device except on that one request.

export async function getProfile(): Promise<LearnerProfile> {
  const db = await dbPromise;
  const raw = await db.get("meta", "profile");
  if (!raw) return {};
  try {
    const parsed = LearnerProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    // Unreadable stored profile is not worth blocking a screen over; the
    // learner can simply set it again.
    console.error("Stored profile could not be read; treating it as unset.");
    return {};
  }
}

export async function saveProfile(profile: LearnerProfile): Promise<void> {
  const db = await dbPromise;
  await db.put("meta", JSON.stringify(profile), "profile");
}

// --- Export / delete (§3.6) ---

export async function exportAllJson(): Promise<string> {
  const db = await dbPromise;
  const entries = await db.getAllFromIndex("entries", "by-createdAt");
  const draft = await db.get("meta", "draft");
  // Everything `deleteAllData` removes has to be in here, or the only backup
  // route silently omits data the delete button destroys.
  const profile = await getProfile();
  return JSON.stringify(
    {
      app: "english-feedback",
      exportedAt: new Date().toISOString(),
      profile,
      draft: draft ?? "",
      entries,
    },
    null,
    2
  );
}

export async function deleteAllData(): Promise<void> {
  const db = await dbPromise;
  await db.clear("entries");
  await db.clear("meta");
}

/**
 * Restore entries from a previously exported backup (WORK-16). The decision
 * of what to write lives in `planImport` (importEntries.ts) so it can be
 * tested without IndexedDB; read and write share one transaction so the
 * existing-id check can never race against a concurrent write from another
 * tab or the queue.
 */
export async function importEntries(rawEntries: unknown[]): Promise<ImportOutcome> {
  const db = await dbPromise;
  const tx = db.transaction("entries", "readwrite");
  const existing = await tx.store.getAll();
  const outcome = planImport(existing, rawEntries);
  for (const entry of outcome.toWrite) {
    await tx.store.put(entry);
  }
  await tx.done;
  return outcome;
}

// --- Derived data ---
//
// Computed from entries on read, never duplicated into storage (§8). The
// implementations live in stats.ts so they can be tested without IndexedDB;
// they are re-exported here so callers keep a single import site.
export {
  getAnalysedCount,
  getErrorCounts,
  getExamples,
  getPatternMap,
  getRecurringCategories,
  getTrend,
  formatErrorLog,
  per100,
  previousRate,
  topCategories,
  categoryOccurrencesBefore,
  getPreviousExample,
  getCategoryHistory,
  getQuietCategories,
  ordinal,
  type CategoryExample,
  type PatternCell,
  type TrendPoint,
  type CategoryHistoryForEntry,
  type QuietCategory,
} from "./stats";

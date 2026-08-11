import { z } from "zod";
import type { Entry } from "./db";

/**
 * The decision logic for restoring an exported backup (Settings' "Export all
 * data") back into the store — WORK-16. Kept apart from `db.ts` for the same
 * reason `claim.ts` is: this is the correctness-critical part, and it can be
 * tested without IndexedDB.
 *
 * Additive only. An import never deletes anything and never overwrites an id
 * already on this device — the store a learner is restoring INTO might
 * already hold newer work than the file they are restoring FROM, and there
 * is no way to ask which is right, so the only safe rule is "what's already
 * here wins."
 */

const STATUSES = ["queued", "analysing", "analysed", "failed"] as const;
const FAIL_REASONS = ["refusal", "rejected", "too_long", "gave_up", "server"] as const;

/**
 * Deliberately loose on a correction's `category` / `severity`: a backup can
 * carry any era of stored taxonomy (pre-v2 legacy names included), and
 * `normalizeCategory` / `normalizeSeverity` (shared/taxonomy.ts) resolve
 * those at READ time everywhere else in the app. This schema's job is only
 * to confirm the shape every read site actually dereferences — it is not a
 * second copy of the network schema, which validates a fresh response, not
 * a restored one. `.passthrough()` at every level keeps whatever else a
 * given era stored (rule, scores, pattern_watch, …) intact rather than
 * silently dropping it.
 */
const ImportedCorrectionSchema = z
  .object({
    original: z.string(),
    corrected: z.string(),
    category: z.string(),
    severity: z.string(),
  })
  .passthrough();

const ImportedFeedbackSchema = z
  .object({
    corrected_text: z.string(),
    corrections: z.array(ImportedCorrectionSchema),
  })
  .passthrough();

const ImportedEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: z.number(),
  text: z.string(),
  wordCount: z.number(),
  status: z.enum(STATUSES),
  feedback: ImportedFeedbackSchema.nullable(),
  analysingSince: z.number().optional(),
  modelId: z.string().optional(),
  promptVersion: z.number().optional(),
  taxonomyVersion: z.number().optional(),
  attempts: z.number().optional(),
  failReason: z.enum(FAIL_REASONS).optional(),
});

export interface ImportOutcome {
  /** The records to actually `put`, already deduplicated and normalised. */
  toWrite: Entry[];
  /** How many records passed validation and were not already present. */
  imported: number;
  /** Ids the store already had — left untouched, per the additive rule. */
  skippedExisting: number;
  /** Records that failed the shape check — not a file this app produced, or
   * damaged in transit. Counted so the learner is told, never silently. */
  invalid: number;
}

/**
 * Decide what an import actually writes, against the store's CURRENT
 * entries — never the caller's stale idea of it, for the same reason
 * `mergeAnalysisResult` (claim.ts) reads inside its transaction rather than
 * trusting a snapshot.
 */
export function planImport(existing: Entry[], rawEntries: unknown[]): ImportOutcome {
  const existingIds = new Set(existing.map((e) => e.id));
  const staged = new Map<string, Entry>();
  let invalid = 0;
  let skippedExisting = 0;

  for (const raw of rawEntries) {
    const parsed = ImportedEntrySchema.safeParse(raw);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    if (existingIds.has(parsed.data.id)) {
      skippedExisting++;
      continue;
    }

    // Validated by the schema above: id/createdAt/text/wordCount/status are
    // exactly the types every read site relies on, and feedback — when
    // present — has the two fields every screen dereferences unconditionally
    // (corrected_text, corrections). Everything else (legacy fields on
    // feedback, and Entry's own optional metadata) rides through unchanged.
    let entry = parsed.data as Entry;

    // An imported claim has no holder: nothing on THIS device is running
    // that analysis, so keeping "analysing" would show the learner a check
    // that never finishes until the 15-minute stale-claim window quietly
    // elapses (claim.ts's STALE_CLAIM_MS). Requeue it immediately instead —
    // the same outcome an abandoned claim gets anyway, just not delayed.
    if (entry.status === "analysing") {
      entry = { ...entry, status: "queued" };
      delete entry.analysingSince;
    }

    // A duplicate id WITHIN the file itself (a corrupted or hand-edited
    // export) keeps whichever copy is newer, rather than whichever happened
    // to come first — the same "newer wins" rule the additive guarantee
    // above applies against the existing store.
    const dup = staged.get(entry.id);
    if (!dup || entry.createdAt > dup.createdAt) staged.set(entry.id, entry);
  }

  return {
    toWrite: [...staged.values()],
    imported: staged.size,
    skippedExisting,
    invalid,
  };
}

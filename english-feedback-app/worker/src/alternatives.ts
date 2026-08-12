/**
 * The one trust boundary for the teacher's unverified, model-asserted free
 * text — because the prompt is the only other control on it and there is
 * deliberately no verification stage. `AgentOutputSchema` leaves both of the
 * fields below loose so a bad value degrades instead of failing the whole
 * call; this is where the strict bounds actually live. Two independent
 * exports, two independent shapes, one file and one test file because they
 * are the same kind of problem:
 *
 * - `attachAlternatives` — "You could also say…", up to 2 other correct ways
 *   to write a sentence the teacher already corrected (ADR 0002 Part B).
 * - `boundNaturalPhrasings` — "How an English speaker might say it", at most
 *   1 per entry, for a sentence the learner did NOT get corrected (ADR 0004).
 *
 * Pure, and belongs beside diff.ts / sentences.ts — the exact kind of
 * bounding logic this project keeps in code, not in prompt trust.
 */

/** A candidate is a note's raw, unbounded phrasings, keyed to the index in
 * `corrections` the teacher's own reading-order zip assigned it to. */
export interface AlternativeCandidate {
  for: number;
  phrasings: string[];
}

export interface Alternative {
  for: number;
  phrasings: string[];
}

/** Mirrors `AlternativeSchema.phrasings` element max in shared/schema.ts. */
const MAX_PHRASING_LENGTH = 120;
/** Mirrors `AlternativeSchema.phrasings` array max in shared/schema.ts. */
const MAX_PHRASINGS = 2;
/** Mirrors `FeedbackSchema.alternatives` array max in shared/schema.ts. */
const MAX_ALTERNATIVES = 3;

/**
 * Only a correction the model itself wrote gets to carry alternatives — a
 * pattern-sourced fix consumed no note, so it should never end up here, but
 * this is the code boundary that makes "never" true even if a future zip
 * change lets one slip through.
 */
interface CorrectionLike {
  source: "pattern" | "model";
}

/**
 * Drops what a verification stage would have caught, then truncates rather
 * than reasoning about which 3 matter most: the teacher is instructed to
 * attach alternatives to at most 3 changes already, so truncation here is a
 * ceiling, not a selection.
 *
 * - an out-of-range `for`, or one pointing at a pattern-sourced correction
 * - an over-long phrasing is DROPPED, never truncated — a phrasing cut
 *   mid-word is broken English shown to a learner as a model of good English
 * - an empty or whitespace-only phrasing
 * - a candidate left with zero phrasings after the above
 * - anything past the first 3 surviving candidates
 */
export function attachAlternatives(
  candidates: AlternativeCandidate[],
  corrections: readonly CorrectionLike[]
): Alternative[] {
  const bounded: Alternative[] = [];
  for (const candidate of candidates) {
    if (candidate.for < 0 || candidate.for >= corrections.length) continue;
    if (corrections[candidate.for]?.source !== "model") continue;

    const phrasings = candidate.phrasings
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p.length <= MAX_PHRASING_LENGTH)
      .slice(0, MAX_PHRASINGS);
    if (phrasings.length === 0) continue;

    bounded.push({ for: candidate.for, phrasings });
  }
  return bounded.slice(0, MAX_ALTERNATIVES);
}

// ---------------------------------------------------------------------------
// ADR 0004 — "How an English speaker might say it".
// ---------------------------------------------------------------------------

/** The model's raw, unbounded claim: an index into the sentences it was
 * given, a rephrasing, and an optional one-line reason. */
export interface NaturalCandidate {
  index: number;
  phrasing: string;
  note?: string;
}

/** What survives bounding. `original` is the learner's own sentence, copied
 * here by the Worker from its own sentence split — the model never supplies
 * it and the index it returned is discarded once it has served this lookup,
 * so nothing downstream can join a phrasing back onto a position in the
 * entry (ADR 0004 Decision 1). */
export interface NaturalPhrasing {
  original: string;
  phrasing: string;
  note?: string;
}

/** Mirrors `NaturalPhrasingSchema.phrasing` max in shared/schema.ts. */
const MAX_NATURAL_PHRASING_LENGTH = 120;
/** Mirrors `NaturalPhrasingSchema.note` max in shared/schema.ts. */
const MAX_NATURAL_NOTE_LENGTH = 100;
/** Mirrors `FeedbackSchema.natural_phrasings` array max in shared/schema.ts —
 * ONE per entry, not four numbers that could drift apart (ADR 0004 Decision 2). */
const MAX_NATURAL_PHRASINGS = 1;

/** Lowercased, whitespace-collapsed, non-alphanumerics stripped — what lets
 * "I want to visit my sister" and "I want to visit my sister." compare equal,
 * and what catches the model handing back the writer's own sentence (a comma
 * moved, a capital changed) as if it were a different, more natural one. */
function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bounds the teacher's optional "How an English speaker might say it"
 * phrasing in code, the same discipline as `attachAlternatives` above, for a
 * sentence the learner was NOT corrected on (ADR 0004). Pure, cannot fail —
 * every rejection is a silent drop, never a thrown error.
 *
 * Drops, never truncates:
 * - an `index` outside the range of `sentences`
 * - a duplicate `index` — the first occurrence wins, later ones are dropped
 * - an `index` for a sentence that produced any correction, pattern-sourced
 *   or model-sourced (disjointness — enforced here, not left to the prompt)
 * - an empty or whitespace-only `phrasing`
 * - a `phrasing` over 120 characters — DROPPED, never truncated, same reason
 *   as `attachAlternatives`: a phrasing cut mid-word is broken English shown
 *   to a learner as a model of good English
 * - a `phrasing` that is not actually different from the learner's own
 *   sentence once both are lowercased, whitespace-collapsed and stripped of
 *   non-alphanumerics — this is what catches "differs only by a comma"
 * - a bad or over-long `note` — the note alone is dropped, the phrasing stays
 * - anything past the first surviving entry
 */
export function boundNaturalPhrasings(
  candidates: readonly NaturalCandidate[],
  sentences: readonly string[],
  correctedSentenceIndices: ReadonlySet<number>
): NaturalPhrasing[] {
  const bounded: NaturalPhrasing[] = [];
  const seenIndices = new Set<number>();
  for (const candidate of candidates) {
    if (bounded.length >= MAX_NATURAL_PHRASINGS) break;
    if (candidate.index < 0 || candidate.index >= sentences.length) continue;
    if (seenIndices.has(candidate.index)) continue;
    seenIndices.add(candidate.index);
    if (correctedSentenceIndices.has(candidate.index)) continue;

    const original = sentences[candidate.index]!;
    const phrasing = candidate.phrasing.trim();
    if (phrasing.length === 0 || phrasing.length > MAX_NATURAL_PHRASING_LENGTH) continue;
    if (normalizeForComparison(phrasing) === normalizeForComparison(original)) continue;

    const entry: NaturalPhrasing = { original, phrasing };
    const note = candidate.note?.trim();
    if (note && note.length > 0 && note.length <= MAX_NATURAL_NOTE_LENGTH) {
      entry.note = note;
    }
    bounded.push(entry);
  }
  return bounded;
}

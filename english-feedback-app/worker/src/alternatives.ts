/**
 * Bounds the teacher's optional "You could also say…" phrasings in code,
 * because the prompt is the only other control on them and there is
 * deliberately no verification stage (ADR 0002 Part B). `AgentOutputSchema`
 * leaves a note's `alternatives` loose so a bad value degrades instead of
 * failing the whole call; this is where the strict bounds actually live.
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

import type { Feedback } from "../../../shared/schema.ts";

/**
 * True when the entry carries any 9-agent-era section the current pipeline
 * no longer writes. On the Feedback page (ADR 0003) this gates whether the
 * legacy appendix section renders at all — a pre-ADR-0001 entry shows one
 * more section than anything analysed today; a current entry shows none.
 */
export function hasLegacyAppendix(fb: Feedback): boolean {
  return Boolean(
    (fb.fluency_notes && fb.fluency_notes.length > 0) ||
      (fb.vocabulary && fb.vocabulary.length > 0) ||
      (fb.drills && fb.drills.length > 0) ||
      fb.pattern_watch
  );
}

/**
 * Which rows of the changes list should print their rule.
 *
 * A model-sourced correction falls back to `ruleFor(category, level)`, which
 * returns one identical sentence per category, and a pattern-sourced one
 * always takes its text from the taxonomy. So an entry with five article
 * mistakes carries the same sentence five times. Printing it five times
 * teaches nothing the first printing did not, and it is most of what makes
 * the page long — the sentences themselves are capped at 20 words.
 *
 * Compared by exact text, never by category: two corrections in one category
 * can legitimately carry different wording from the model, and suppressing a
 * sentence the learner has not seen would hide teaching rather than
 * repetition. Identical text is noise; different text is a lesson.
 */
export function explanationRows(
  corrections: ReadonlyArray<{ explanation?: string; rule?: string }>
): boolean[] {
  const seen = new Set<string>();
  return corrections.map((c) => {
    const text = (c.explanation ?? c.rule ?? "").trim();
    if (text === "" || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

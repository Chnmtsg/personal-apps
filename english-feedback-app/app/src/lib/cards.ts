import type { Feedback } from "../../../shared/schema.ts";

/**
 * The fixed Feedback stack (ADR 0002 Part A). Exactly one card per kind, in
 * this order; `appendix` is the sole conditional slot.
 */
export type FeedbackCard =
  | { kind: "message" }
  | { kind: "changes" }
  | { kind: "corrected" }
  | { kind: "appendix" }
  | { kind: "closing" };

/**
 * True when the entry carries any 9-agent-era section the current pipeline
 * no longer writes. These move into one appendix card rather than each
 * earning its own (ADR 0002), so a pre-ADR-0001 entry stays exactly one card
 * longer than anything analysed today — never open-ended.
 */
function hasAppendix(fb: Feedback): boolean {
  return Boolean(
    (fb.fluency_notes && fb.fluency_notes.length > 0) ||
      (fb.vocabulary && fb.vocabulary.length > 0) ||
      (fb.drills && fb.drills.length > 0) ||
      fb.pattern_watch
  );
}

/**
 * The card stack for one entry's feedback: the teacher's message, every
 * change as one list (`ambiguous` folds into that same card — see
 * Feedback.tsx), the corrected text, then closing — plus one legacy
 * appendix card before closing when the entry has 9-agent-era fields.
 *
 * Card count is a pure function of stored data, never of correction count: a
 * 12-edit entry and a 1-edit entry both get exactly one "changes" card, and
 * nothing the current pipeline produces is ever more than four cards.
 */
export function buildFeedbackCards(fb: Feedback): FeedbackCard[] {
  const cards: FeedbackCard[] = [{ kind: "message" }, { kind: "changes" }];
  if (fb.corrected_text) cards.push({ kind: "corrected" });
  if (hasAppendix(fb)) cards.push({ kind: "appendix" });
  cards.push({ kind: "closing" });
  return cards;
}

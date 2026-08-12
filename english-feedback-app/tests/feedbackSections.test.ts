import { test } from "node:test";
import assert from "node:assert/strict";
import { explanationRows, hasLegacyAppendix } from "../app/src/lib/feedbackSections.ts";
import type { Feedback } from "../shared/schema.ts";

/** A feedback shape the current (ADR 0001) pipeline can actually produce. */
function currentEntry(overrides: Partial<Feedback> = {}): Feedback {
  return {
    risk: "none",
    corrected_text: "I am a geologist.",
    corrections: [
      {
        original: "I am geologist",
        corrected: "I am a geologist",
        category: "article",
        severity: "noticeable",
        explanation: "English needs an article before a singular countable noun.",
        source: "model",
      },
    ],
    teacher_feedback: "Good clear entry.",
    ...overrides,
  };
}

// hasLegacyAppendix — the legacy section renders if and only if the entry
// stores one of the 9-agent-era fields (ADR 0003).

test("a current-pipeline entry has no legacy appendix", () => {
  assert.equal(hasLegacyAppendix(currentEntry()), false);
});

test("a legacy entry with 9-agent-era fields has a legacy appendix", () => {
  const legacy = currentEntry({
    fluency_notes: [{ before: "very good", after: "excellent", why: "more natural" }],
    vocabulary: [{ term: "outcrop", stress: "OUT-crop", meaning: "exposed rock", example: "We saw an outcrop." }],
    drills: [{ prompt: "Yesterday I ___ to work.", answer: "went", distractors: ["go", "goed"], hint: "past tense" }],
    pattern_watch: { category: "article", entries_clean: 3, note: "back again", practice: "the shop" },
  });
  assert.equal(hasLegacyAppendix(legacy), true);
});

test("a legacy appendix appears when only one legacy field is present", () => {
  const withPatternWatchOnly = currentEntry({
    pattern_watch: { category: "article", entries_clean: 3, note: "back again", practice: "the shop" },
  });
  assert.equal(hasLegacyAppendix(withPatternWatchOnly), true);

  const withDrillsOnly = currentEntry({
    drills: [{ prompt: "p", answer: "a", distractors: [], hint: "h" }],
  });
  assert.equal(hasLegacyAppendix(withDrillsOnly), true);
});

test("empty legacy arrays do not count as a legacy appendix", () => {
  const emptyArrays = currentEntry({ fluency_notes: [], vocabulary: [], drills: [] });
  assert.equal(hasLegacyAppendix(emptyArrays), false);
});

// explanationRows — a rule prints once per entry, not once per mistake.

test("an identical rule prints on its first row and is suppressed after", () => {
  const article = "English needs an article before a singular countable noun.";
  const rows = explanationRows([
    { explanation: article },
    { explanation: "Finished past actions use the past form: go becomes went." },
    { explanation: article },
    { explanation: article },
  ]);
  assert.deepEqual(rows, [true, true, false, false]);
});

test("different wording in the same category still prints — repetition is hidden, teaching is not", () => {
  const rows = explanationRows([
    { explanation: "Use 'the' once the reader knows which one you mean." },
    { explanation: "Use a/an to introduce something new." },
  ]);
  assert.deepEqual(rows, [true, true]);
});

test("a legacy correction carrying `rule` instead of `explanation` is deduped on the same text", () => {
  const rows = explanationRows([
    { rule: "English order is subject, verb, object." },
    { rule: "English order is subject, verb, object." },
    { explanation: "English order is subject, verb, object." },
  ]);
  assert.deepEqual(rows, [true, false, false]);
});

test("a correction with no rule text at all never claims a row", () => {
  assert.deepEqual(explanationRows([{}, { explanation: "" }, { explanation: "   " }]), [
    false,
    false,
    false,
  ]);
});

test("whitespace around an otherwise identical rule does not defeat the dedupe", () => {
  const rows = explanationRows([
    { explanation: "Some nouns cannot be counted." },
    { explanation: "  Some nouns cannot be counted.  " },
  ]);
  assert.deepEqual(rows, [true, false]);
});

test("no corrections produces no rows", () => {
  assert.deepEqual(explanationRows([]), []);
});

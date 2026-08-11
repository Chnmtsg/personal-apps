import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeedbackCards } from "../app/src/lib/cards.ts";
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

test("a current-pipeline entry is exactly four cards", () => {
  const cards = buildFeedbackCards(currentEntry());
  assert.deepEqual(
    cards.map((c) => c.kind),
    ["message", "changes", "corrected", "closing"]
  );
});

test("card count does not grow with the number of corrections", () => {
  const many = currentEntry({
    corrections: Array.from({ length: 12 }, (_, i) => ({
      original: `word${i}`,
      corrected: `fixed${i}`,
      category: "article" as const,
      severity: "noticeable" as const,
      explanation: "rule",
      source: "model" as const,
    })),
  });
  assert.equal(buildFeedbackCards(many).length, 4);
});

test("zero corrections is still four cards, not fewer", () => {
  const empty = currentEntry({ corrections: [] });
  assert.deepEqual(
    buildFeedbackCards(empty).map((c) => c.kind),
    ["message", "changes", "corrected", "closing"]
  );
});

test("ambiguous entries fold into the changes card, not a card of their own", () => {
  const withAmbiguous = currentEntry({
    ambiguous: [{ index: 0, question: "Did you mean today or yesterday?" }],
  });
  assert.deepEqual(
    buildFeedbackCards(withAmbiguous).map((c) => c.kind),
    ["message", "changes", "corrected", "closing"]
  );
});

test("a legacy entry with 9-agent-era fields gets exactly one appendix card, before closing", () => {
  const legacy = currentEntry({
    fluency_notes: [{ before: "very good", after: "excellent", why: "more natural" }],
    vocabulary: [{ term: "outcrop", stress: "OUT-crop", meaning: "exposed rock", example: "We saw an outcrop." }],
    drills: [{ prompt: "Yesterday I ___ to work.", answer: "went", distractors: ["go", "goed"], hint: "past tense" }],
    pattern_watch: { category: "article", entries_clean: 3, note: "back again", practice: "the shop" },
  });
  assert.deepEqual(
    buildFeedbackCards(legacy).map((c) => c.kind),
    ["message", "changes", "corrected", "appendix", "closing"]
  );
});

test("appendix appears when only one legacy field is present", () => {
  const withPatternWatchOnly = currentEntry({
    pattern_watch: { category: "article", entries_clean: 3, note: "back again", practice: "the shop" },
  });
  assert.ok(buildFeedbackCards(withPatternWatchOnly).some((c) => c.kind === "appendix"));

  const withDrillsOnly = currentEntry({
    drills: [{ prompt: "p", answer: "a", distractors: [], hint: "h" }],
  });
  assert.ok(buildFeedbackCards(withDrillsOnly).some((c) => c.kind === "appendix"));
});

test("empty legacy arrays do not create an appendix card", () => {
  const emptyArrays = currentEntry({ fluency_notes: [], vocabulary: [], drills: [] });
  assert.deepEqual(
    buildFeedbackCards(emptyArrays).map((c) => c.kind),
    ["message", "changes", "corrected", "closing"]
  );
});

test("no corrected_text skips the corrected card but keeps the rest", () => {
  const noCorrectedText = currentEntry({ corrected_text: "" });
  assert.deepEqual(
    buildFeedbackCards(noCorrectedText).map((c) => c.kind),
    ["message", "changes", "closing"]
  );
});

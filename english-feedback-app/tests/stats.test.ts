import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getErrorCounts,
  getExamples,
  getPatternExplanations,
  getTrend,
} from "../app/src/lib/stats.ts";
import { countWords } from "../app/src/lib/categories.ts";
import type { Entry } from "../app/src/lib/db.ts";
import type { ErrorCategory, Feedback } from "../shared/schema.ts";

type Correction = Feedback["corrections"][number];

const correction = (category: ErrorCategory, original = "x", corrected = "y"): Correction => ({
  original,
  corrected,
  category,
  rule: `rule for ${category}`,
  severity: "minor",
});

const day = (yyyy: number, mm: number, dd: number) => Date.UTC(yyyy, mm - 1, dd, 12);

function entry(over: {
  id?: string;
  createdAt: number;
  wordCount?: number;
  status?: Entry["status"];
  corrections?: Correction[];
  patterns?: Feedback["patterns"];
}): Entry {
  const status = over.status ?? "analysed";
  return {
    id: over.id ?? `e-${over.createdAt}`,
    createdAt: over.createdAt,
    text: "some text",
    wordCount: over.wordCount ?? 100,
    status,
    feedback:
      status === "analysed"
        ? {
            corrected_text: "corrected",
            cefr_estimate: "B1",
            corrections: over.corrections ?? [],
            patterns: over.patterns ?? [],
            scores: { grammar: 50, vocabulary: 50, naturalness: 50 },
            one_thing_to_fix: "articles",
            what_went_well: "clear structure",
          }
        : null,
  };
}

test("counts corrections per category across entries", () => {
  const counts = getErrorCounts([
    entry({ createdAt: day(2026, 1, 1), corrections: [correction("articles"), correction("articles"), correction("copula")] }),
    entry({ createdAt: day(2026, 1, 2), corrections: [correction("articles")] }),
  ]);
  assert.equal(counts.get("articles"), 3);
  assert.equal(counts.get("copula"), 1);
  assert.equal(counts.get("spelling"), undefined);
});

test("queued and failed entries contribute nothing to any statistic", () => {
  const entries = [
    entry({ createdAt: day(2026, 1, 1), status: "queued" }),
    entry({ createdAt: day(2026, 1, 2), status: "failed" }),
  ];
  assert.equal(getErrorCounts(entries).size, 0);
  assert.deepEqual(getTrend(entries), []);
  assert.deepEqual(getExamples(entries, "articles"), []);
});

test("the trend normalises to errors per 100 words, not raw counts", () => {
  // 3 errors in 150 words is a better result than 2 errors in 50, and the
  // chart has to say so — this is the whole point of the metric.
  const trend = getTrend([
    entry({ createdAt: day(2026, 1, 1), wordCount: 50, corrections: [correction("articles"), correction("copula")] }),
    entry({ createdAt: day(2026, 1, 2), wordCount: 150, corrections: [correction("articles"), correction("copula"), correction("spelling")] }),
  ]);
  assert.deepEqual(trend, [
    { date: "2026-01-01", errorsPer100Words: 4 },
    { date: "2026-01-02", errorsPer100Words: 2 },
  ]);
});

test("the trend aggregates same-day entries and stays in date order", () => {
  const trend = getTrend([
    entry({ id: "b", createdAt: day(2026, 3, 5), wordCount: 100, corrections: [correction("articles")] }),
    entry({ id: "a", createdAt: day(2026, 1, 9), wordCount: 100, corrections: [correction("articles")] }),
    entry({ id: "c", createdAt: day(2026, 3, 5), wordCount: 100, corrections: [correction("copula")] }),
  ]);
  assert.deepEqual(trend.map((p) => p.date), ["2026-01-09", "2026-03-05"]);
  assert.equal(trend[1].errorsPer100Words, 1);
});

test("a zero-word day reports zero rather than dividing by zero", () => {
  const trend = getTrend([entry({ createdAt: day(2026, 1, 1), wordCount: 0 })]);
  assert.deepEqual(trend, [{ date: "2026-01-01", errorsPer100Words: 0 }]);
});

test("examples for a category come back newest first", () => {
  const examples = getExamples(
    [
      entry({ id: "old", createdAt: day(2026, 1, 1), corrections: [correction("articles", "geologist", "a geologist")] }),
      entry({ id: "new", createdAt: day(2026, 2, 1), corrections: [correction("articles", "sample", "a sample"), correction("spelling")] }),
    ],
    "articles"
  );
  assert.deepEqual(examples.map((e) => e.entryId), ["new", "old"]);
  assert.equal(examples[0].corrected, "a sample");
});

test("the most recent explanation per category wins", () => {
  // getEntries returns newest-first, so the first one seen is the newest.
  const explanations = getPatternExplanations([
    entry({ createdAt: day(2026, 2, 1), patterns: [{ category: "articles", count: 2, explanation: "newest" }] }),
    entry({ createdAt: day(2026, 1, 1), patterns: [{ category: "articles", count: 5, explanation: "older" }] }),
  ]);
  assert.equal(explanations.get("articles"), "newest");
});

test("counts words the way the Analyse gate does", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t "), 0);
  assert.equal(countWords("one"), 1);
  assert.equal(countWords("  spaced   out  words \n here "), 4);
});

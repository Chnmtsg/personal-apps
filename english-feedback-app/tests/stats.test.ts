import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categoryOccurrencesBefore,
  formatErrorLog,
  getAnalysedCount,
  getCategoryHistory,
  getErrorCounts,
  getExamples,
  getPatternMap,
  getPreviousExample,
  getQuietCategories,
  getRecurringCategories,
  getTrend,
  ordinal,
  per100,
  previousRate,
  topCategories,
} from "../app/src/lib/stats.ts";
import { countWords } from "../app/src/lib/categories.ts";
import type { Entry } from "../app/src/lib/db.ts";
import type { Feedback } from "../shared/schema.ts";

type Correction = Feedback["corrections"][number];

// Deliberately the PRE-v2 stored shape — legacy category names, `rule`
// instead of `explanation`, legacy severity. Every statistic must keep
// counting these entries correctly under their v2 names, or a taxonomy
// change silently rewrites the learner's history.
const correction = (category: string, original = "x", corrected = "y"): Correction =>
  ({
    original,
    corrected,
    category,
    rule: `rule for ${category}`,
    severity: "minor",
  }) as unknown as Correction;

const v2correction = (
  category: Correction["category"],
  patternId?: number
): Correction => ({
  original: "x",
  corrected: "y",
  category,
  severity: "noticeable",
  explanation: `why ${category}`,
  source: patternId === undefined ? "model" : "pattern",
  ...(patternId === undefined ? {} : { pattern_id: patternId }),
});

const day = (yyyy: number, mm: number, dd: number) => Date.UTC(yyyy, mm - 1, dd, 12);

function entry(over: {
  id?: string;
  createdAt: number;
  wordCount?: number;
  status?: Entry["status"];
  corrections?: Correction[];
  patterns?: Feedback["patterns"];
  risk?: "none" | "acute";
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
            ...(over.risk ? { risk: over.risk } : {}),
          }
        : null,
  };
}

/** An acute entry as the Worker actually stores it: "analysed", empty
 * corrections, risk "acute" — never a grammar lesson, but still a real,
 * readable entry in the learner's own record. */
const acuteEntry = (over: { id?: string; createdAt: number; wordCount?: number }): Entry =>
  entry({ ...over, corrections: [], risk: "acute" });

test("legacy category names are counted under their v2 ids", () => {
  const counts = getErrorCounts([
    entry({ createdAt: day(2026, 1, 1), corrections: [correction("articles"), correction("articles"), correction("copula")] }),
    entry({ createdAt: day(2026, 1, 2), corrections: [correction("articles")] }),
  ]);
  assert.equal(counts.get("article"), 3);
  assert.equal(counts.get("copula"), 1);
  assert.equal(counts.get("spelling"), undefined);
});

test("legacy and v2 entries count into one history", () => {
  const counts = getErrorCounts([
    entry({ createdAt: day(2026, 1, 1), corrections: [correction("comma_splice")] }),
    entry({ createdAt: day(2026, 1, 2), corrections: [v2correction("run_on")] }),
  ]);
  assert.equal(counts.get("run_on"), 2);
});

test("queued and failed entries contribute nothing to any statistic", () => {
  const entries = [
    entry({ createdAt: day(2026, 1, 1), status: "queued" }),
    entry({ createdAt: day(2026, 1, 2), status: "failed" }),
  ];
  assert.equal(getErrorCounts(entries).size, 0);
  assert.deepEqual(getTrend(entries), []);
  assert.deepEqual(getExamples(entries, "article"), []);
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

test("examples for a category come back newest first, across taxonomy eras", () => {
  const examples = getExamples(
    [
      entry({ id: "old", createdAt: day(2026, 1, 1), corrections: [correction("articles", "geologist", "a geologist")] }),
      entry({ id: "new", createdAt: day(2026, 2, 1), corrections: [correction("articles", "sample", "a sample"), correction("spelling")] }),
    ],
    "article"
  );
  assert.deepEqual(examples.map((e) => e.entryId), ["new", "old"]);
  assert.equal(examples[0].corrected, "a sample");
  // A legacy correction's `rule` still surfaces as the example's rule text.
  assert.equal(examples[0].rule, "rule for articles");
});

test("the pattern map reflects stored pattern ids and stays honest about the rest", () => {
  const cells = getPatternMap([
    entry({ createdAt: day(2026, 1, 2), corrections: [v2correction("preposition", 53)] }),
    entry({ createdAt: day(2026, 1, 1), corrections: [v2correction("word_choice")] }),
  ]);
  const cell53 = cells.find((c) => c.id === 53)!;
  assert.equal(cell53.status, "active");
  assert.equal(cell53.hits, 1);
  // A model-sourced correction has no pattern id, so it marks nothing.
  assert.ok(cells.every((c) => c.id === 53 || c.status === "unseen"));
});

// WORK-11 / ruling C2: the map is contracted to DETERMINISTIC_PATTERNS (49),
// not the full JOURNAL_PATTERNS (96) — `pattern_id` is only ever written by
// the deterministic matcher, so the other ~50 checklist entries could never
// leave "unseen". Mapping the full 96 would show a denominator ("N of 96")
// the code can never reach.
test("the pattern map has exactly one cell per deterministic pattern, not the full checklist", () => {
  const cells = getPatternMap([]);
  assert.equal(cells.length, 49);
  assert.ok(cells.every((c) => c.status === "unseen"));
});

test("getRecurringCategories sorts by count, most frequent first", () => {
  const entries = [
    entry({
      createdAt: day(2026, 1, 1),
      corrections: [
        correction("articles"),
        correction("articles"),
        correction("articles"),
        correction("copula"),
        correction("copula"),
        correction("spelling"),
      ],
    }),
  ];
  // All three are in the only (and therefore most recent) entry, so none of
  // them has a clean streak. Categories come back under their v2 ids.
  assert.deepEqual(getRecurringCategories(entries), [
    { category: "article", count: 3, cleanStreak: 0 },
    { category: "copula", count: 2, cleanStreak: 0 },
    { category: "spelling", count: 1, cleanStreak: 0 },
  ]);
});

test("getRecurringCategories respects the limit", () => {
  const entries = [
    entry({
      createdAt: day(2026, 1, 1),
      corrections: [correction("articles"), correction("copula"), correction("spelling")],
    }),
  ];
  assert.equal(getRecurringCategories(entries, 2).length, 2);
  assert.equal(getRecurringCategories(entries, 5).length, 3);
});

test("getRecurringCategories is empty for no analysed entries", () => {
  assert.deepEqual(getRecurringCategories([]), []);
  assert.deepEqual(getRecurringCategories([entry({ createdAt: day(2026, 1, 1), status: "queued" })]), []);
});

// The streak is what lets feedback say "this came back after four clean
// entries" instead of correcting the same error forever as if it were new.
// It becomes a factual claim about the learner, so a wrong number here is a
// confident lie about their own history.
test("a clean streak counts the most recent entries without that category", () => {
  // Newest first, as getEntries returns them: two clean, then articles.
  const [recurring] = getRecurringCategories([
    entry({ id: "c", createdAt: day(2026, 1, 3), corrections: [correction("spelling")] }),
    entry({ id: "b", createdAt: day(2026, 1, 2), corrections: [correction("spelling")] }),
    entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
  ]).filter((r) => r.category === "article");
  assert.equal(recurring.cleanStreak, 2);
});

test("a category in the most recent entry has no streak at all", () => {
  const [recurring] = getRecurringCategories([
    entry({ id: "b", createdAt: day(2026, 1, 2), corrections: [correction("articles")] }),
    entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
  ]);
  assert.equal(recurring.cleanStreak, 0);
});

test("only analysed entries break a streak", () => {
  // A queued or failed entry says nothing about whether the learner made the
  // error, so counting it would inflate the streak into a false claim.
  const [recurring] = getRecurringCategories([
    entry({ id: "d", createdAt: day(2026, 1, 4), status: "queued" }),
    entry({ id: "c", createdAt: day(2026, 1, 3), status: "failed" }),
    entry({ id: "b", createdAt: day(2026, 1, 2), corrections: [correction("spelling")] }),
    entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
  ]).filter((r) => r.category === "article");
  assert.equal(recurring.cleanStreak, 1);
});

test("counting analysed entries ignores queued and failed ones", () => {
  assert.equal(
    getAnalysedCount([
      entry({ id: "b", createdAt: day(2026, 1, 2), status: "queued" }),
      entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
    ]),
    1
  );
  assert.equal(getAnalysedCount([]), 0);
});

test("the error log is pasteable, ordered by count, and uses the taxonomy keys", () => {
  const log = formatErrorLog([
    entry({
      createdAt: day(2026, 1, 1),
      corrections: [
        correction("articles"),
        correction("articles"),
        correction("articles"),
        correction("comma_splice"),
        correction("comma_splice"),
        correction("spelling"),
      ],
    }),
  ]);
  const lines = log.split("\n");
  assert.equal(lines[0], "Here is my error log so far. Please continue counting from these numbers.");
  // The v2 keys, not the screen labels and not the legacy names the fixture
  // stored — these are the names the prompts use, so both sides agree.
  assert.deepEqual(lines.slice(2, 5), [
    "article ... 3",
    "run_on .... 2",
    "spelling .. 1",
  ]);
  // The counts line up in a column, which is what makes the block readable
  // both to the learner and to the assistant they paste it into.
  const countColumns = lines.slice(2, 5).map((l) => l.lastIndexOf(" "));
  assert.equal(new Set(countColumns).size, 1);
  assert.match(log, /keep counting these/);
});

test("an empty error log is empty rather than a header with nothing under it", () => {
  assert.equal(formatErrorLog([]), "");
  assert.equal(formatErrorLog([entry({ createdAt: day(2026, 1, 1), status: "queued" })]), "");
});

/**
 * Runs `fn` as if the learner's device were in the given timezone. The trend
 * is the only statistic that buckets by calendar day, and every fixture above
 * sits at noon UTC — the one time of day at which the bug below is invisible,
 * which is why it survived.
 */
function inTimezone(tz: string, fn: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    process.env.TZ = previous;
  }
}

// The bug these caught: the trend keyed on toISOString(), i.e. UTC. The
// learner writes in Mongolia (UTC+8), so anything written before 08:00 local
// was charted on the previous day, and the chart disagreed with the local
// date History shows for that very same entry.
test("an entry written after midnight is charted on the learner's day, not the UTC one", () => {
  inTimezone("Asia/Ulaanbaatar", () => {
    const afterMidnight = Date.UTC(2026, 0, 1, 17, 0); // 01:00 local, 2 January
    const trend = getTrend([
      entry({
        createdAt: afterMidnight,
        wordCount: 100,
        corrections: [correction("articles"), correction("copula")],
      }),
    ]);
    assert.deepEqual(trend, [{ date: "2026-01-02", errorsPer100Words: 2 }]);
  });
});

test("entries either side of local midnight stay on their own local days", () => {
  inTimezone("Asia/Ulaanbaatar", () => {
    const evening = Date.UTC(2026, 0, 1, 15, 0); // 23:00 local, 1 January
    const lateNight = Date.UTC(2026, 0, 1, 17, 0); // 01:00 local, 2 January
    const trend = getTrend([
      entry({ id: "a", createdAt: evening, wordCount: 100, corrections: [correction("articles")] }),
      entry({ id: "b", createdAt: lateNight, wordCount: 100, corrections: [correction("articles")] }),
    ]);
    assert.deepEqual(
      trend.map((p) => p.date),
      ["2026-01-01", "2026-01-02"]
    );
  });
});

test("a timezone behind UTC charts an evening entry on that evening's day", () => {
  inTimezone("America/Los_Angeles", () => {
    const evening = Date.UTC(2026, 0, 2, 2, 0); // 18:00 local, 1 January
    const trend = getTrend([
      entry({ createdAt: evening, wordCount: 100, corrections: [correction("articles")] }),
    ]);
    assert.deepEqual(
      trend.map((p) => p.date),
      ["2026-01-01"]
    );
  });
});

test("counts words the way the Analyse gate does", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t "), 0);
  assert.equal(countWords("one"), 1);
  assert.equal(countWords("  spaced   out  words \n here "), 4);
});

// per100 used to be defined byte-for-byte twice, in Feedback.tsx and
// History.tsx — moved here (WORK-13) so the History row and the Feedback
// card can never drift apart on what the number means.
test("per100 counts corrections per 100 words, not the raw count", () => {
  const rate = per100(
    entry({ createdAt: day(2026, 1, 1), wordCount: 50, corrections: [correction("articles"), correction("copula")] })
  );
  assert.equal(rate, 4);
});

test("per100 is null with no feedback or with zero words", () => {
  assert.equal(per100(entry({ createdAt: day(2026, 1, 1), status: "queued" })), null);
  assert.equal(per100(entry({ createdAt: day(2026, 1, 1), wordCount: 0 })), null);
});

test("topCategories names the two heaviest categories for one entry, capped at two", () => {
  const summary = topCategories(
    entry({
      createdAt: day(2026, 1, 1),
      corrections: [
        correction("articles"),
        correction("articles"),
        correction("copula"),
        correction("spelling"),
      ],
    })
  );
  assert.equal(summary, "Articles ×2 · Missing 'to be' ×1");
});

test("topCategories is empty for an entry with no feedback", () => {
  assert.equal(topCategories(entry({ createdAt: day(2026, 1, 1), status: "queued" })), "");
});

test("previousRate finds the nearest earlier analysed entry's rate, skipping queued and failed ones between", () => {
  // Newest first, as getEntries() returns them.
  const entries = [
    entry({ id: "c", createdAt: day(2026, 1, 4), wordCount: 100, corrections: [correction("articles")] }),
    entry({ id: "b-queued", createdAt: day(2026, 1, 3), status: "queued" }),
    entry({ id: "b-failed", createdAt: day(2026, 1, 3), status: "failed" }),
    entry({ id: "a", createdAt: day(2026, 1, 1), wordCount: 200, corrections: [correction("articles"), correction("copula")] }),
  ];
  assert.equal(previousRate(entries, "c"), 1);
});

test("previousRate is null for the oldest analysed entry, and for an id not in the list", () => {
  const entries = [
    entry({ id: "b", createdAt: day(2026, 1, 2), wordCount: 100, corrections: [correction("articles")] }),
    entry({ id: "a", createdAt: day(2026, 1, 1), wordCount: 100, corrections: [correction("articles")] }),
  ];
  assert.equal(previousRate(entries, "a"), null);
  assert.equal(previousRate(entries, "missing"), null);
});

// An acute entry is stored "analysed" with corrections: [] — the Worker
// deliberately never grades a crisis. Left uncounted for what it is, it
// would read back as a flawless entry: 0.0 per 100 words, a clean-streak
// increment, and "your last entry was 0.0" rendered right after a crisis.
// These pin the fix at every point that reads risk.

test("per100 is null for an acute entry, not a flattering zero", () => {
  const rate = per100(acuteEntry({ createdAt: day(2026, 1, 1), wordCount: 80 }));
  assert.equal(rate, null);
});

test("previousRate skips an acute entry to the last entry that was actually graded", () => {
  // Newest first, as getEntries() returns them: a real entry, then the
  // crisis entry, then an earlier real entry. The closing card for "c" must
  // never compare against the acute entry's ungraded 0.0.
  const entries = [
    entry({ id: "c", createdAt: day(2026, 1, 4), wordCount: 100, corrections: [correction("articles")] }),
    acuteEntry({ id: "acute", createdAt: day(2026, 1, 3), wordCount: 60 }),
    entry({ id: "a", createdAt: day(2026, 1, 1), wordCount: 200, corrections: [correction("articles"), correction("copula")] }),
  ];
  assert.equal(previousRate(entries, "c"), 1);
});

test("previousRate is null when the only earlier entry is acute", () => {
  const entries = [
    entry({ id: "b", createdAt: day(2026, 1, 2), wordCount: 100, corrections: [correction("articles")] }),
    acuteEntry({ id: "a", createdAt: day(2026, 1, 1), wordCount: 60 }),
  ];
  assert.equal(previousRate(entries, "b"), null);
});

test("an acute entry does not count toward getAnalysedCount", () => {
  assert.equal(
    getAnalysedCount([
      acuteEntry({ id: "acute", createdAt: day(2026, 1, 2) }),
      entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
    ]),
    1
  );
});

test("an acute entry does not extend a clean streak", () => {
  // Without the fix, the acute entry (status "analysed", no corrections)
  // reads as a clean lesson and the streak the model is told becomes 2
  // instead of 1 — a fabricated claim about the learner's history.
  const [recurring] = getRecurringCategories([
    acuteEntry({ id: "acute", createdAt: day(2026, 1, 3) }),
    entry({ id: "b", createdAt: day(2026, 1, 2), corrections: [correction("spelling")] }),
    entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
  ]).filter((r) => r.category === "article");
  assert.equal(recurring.cleanStreak, 1);
});

test("an acute entry is excluded from the trend and pattern map, but still exists as an entry the learner can revisit", () => {
  const entries = [acuteEntry({ id: "acute", createdAt: day(2026, 1, 1), wordCount: 60 })];
  assert.deepEqual(getTrend(entries), []);
  assert.ok(getPatternMap(entries).every((c) => c.status === "unseen"));
  // stats.ts only derives numbers — it never removes the entry itself. The
  // caller (getEntries()) still returns it; History and Feedback still find
  // it by id. That guarantee is exercised by db.ts/claim.ts, not here.
  assert.equal(entries.length, 1);
});

// ---------------------------------------------------------------------------
// Per-correction history: categoryOccurrencesBefore, getPreviousExample,
// getCategoryHistory, getQuietCategories, ordinal.
// ---------------------------------------------------------------------------

// The core guarantee: history is relative to the entry being VIEWED, not to
// the device's current state. Reopening the same list at an earlier entry
// must report a smaller count — the same list, two different truthful
// answers, because the question ("how many times before THIS one") differs.
test("occurrence history is computed relative to the entry being viewed, not all-time", () => {
  const entries = [
    entry({ id: "c", createdAt: day(2026, 1, 3), corrections: [correction("articles")] }),
    entry({ id: "b", createdAt: day(2026, 1, 2), corrections: [correction("articles")] }),
    entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
  ];
  assert.equal(categoryOccurrencesBefore(entries, "a", "article"), 0);
  assert.equal(categoryOccurrencesBefore(entries, "b", "article"), 1);
  assert.equal(categoryOccurrencesBefore(entries, "c", "article"), 2);
  // Reopening "b" today must show exactly what was true when "b" was
  // written — 1 prior occurrence — never the all-time total of 2.
  assert.equal(getCategoryHistory(entries, "b", "article").occurrenceNumber, 2);
});

test("a legacy category name in a past entry is still counted under its v2 id", () => {
  const entries = [
    entry({ id: "new", createdAt: day(2026, 1, 2), corrections: [correction("comma_splice")] }),
    entry({ id: "old", createdAt: day(2026, 1, 1), corrections: [correction("comma_splice")] }),
  ];
  assert.equal(categoryOccurrencesBefore(entries, "new", "run_on"), 1);
  assert.equal(getPreviousExample(entries, "new", "run_on")?.entryId, "old");
});

test("an acute entry between two real ones does not count toward occurrence history, even if it carried a stray correction", () => {
  const entries = [
    entry({ id: "c", createdAt: day(2026, 1, 3), corrections: [correction("articles")] }),
    // Not how the Worker actually stores an acute entry (it always writes
    // corrections: []) — constructed this way on purpose, so the test
    // proves the function checks risk === "acute" itself rather than
    // happening to pass because acute entries are always empty.
    entry({ id: "acute", createdAt: day(2026, 1, 2), corrections: [correction("articles")], risk: "acute" }),
    entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] }),
  ];
  assert.equal(categoryOccurrencesBefore(entries, "c", "article"), 1);
  assert.equal(getPreviousExample(entries, "c", "article")?.entryId, "a");
});

test("the first-ever occurrence of a category has no previous example and occurrence number 1", () => {
  const entries = [entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] })];
  const history = getCategoryHistory(entries, "a", "article");
  assert.equal(history.occurrenceNumber, 1);
  assert.equal(history.previousExample, null);
});

test("getPreviousExample carries the learner's own words verbatim", () => {
  const entries = [
    entry({ id: "b", createdAt: day(2026, 1, 2), corrections: [correction("articles")] }),
    entry({
      id: "a",
      createdAt: day(2026, 1, 1),
      corrections: [correction("articles", "I am geologist", "I am a geologist")],
    }),
  ];
  const example = getPreviousExample(entries, "b", "article");
  assert.equal(example?.original, "I am geologist");
  assert.equal(example?.corrected, "I am a geologist");
  assert.equal(example?.entryId, "a");
});

test("categoryOccurrencesBefore and getPreviousExample are 0/null for an id not in the list", () => {
  const entries = [entry({ id: "a", createdAt: day(2026, 1, 1), corrections: [correction("articles")] })];
  assert.equal(categoryOccurrencesBefore(entries, "missing", "article"), 0);
  assert.equal(getPreviousExample(entries, "missing", "article"), null);
});

/** Builds `n` clean filler entries (newest-first-compatible order), with one
 * entry at `hitAt` carrying a correction in `category`. Mirrors the fixture
 * shape getPatternMap's own test already relies on. */
function fillerEntries(n: number, hitAt: number, category: string): Entry[] {
  return Array.from({ length: n }, (_, i) =>
    entry({
      id: `f${i}`,
      createdAt: day(2026, 2, 1) - i,
      corrections: i === hitAt ? [v2correction(category as Correction["category"])] : [correction("spelling")],
    })
  );
}

test("gone-quiet uses the same PATTERN_ACTIVE_WINDOW boundary as the pattern map", () => {
  // "verb_tense" last appeared 13 entries back — still inside the window, so
  // it is active, not quiet. "collocation" last appeared 14 entries back —
  // exactly the boundary — so it is quiet.
  const viewed = entry({ id: "viewed", createdAt: day(2026, 3, 1), corrections: [] });
  const filler = fillerEntries(20, 13, "verb_tense");
  filler[14] = entry({
    id: filler[14].id,
    createdAt: filler[14].createdAt,
    corrections: [v2correction("collocation")],
  });
  const entries = [viewed, ...filler];

  const quiet = getQuietCategories(entries, "viewed");
  assert.ok(!quiet.some((q) => q.category === "verb_tense"));
  const collocation = quiet.find((q) => q.category === "collocation");
  assert.equal(collocation?.entriesSince, 14);
});

test("a category still being corrected in the entry on screen is never reported as gone quiet", () => {
  const filler = fillerEntries(20, 15, "pronoun");
  const viewed = entry({ id: "viewed", createdAt: day(2026, 3, 1), corrections: [correction("pronoun")] });
  const entries = [viewed, ...filler];
  const quiet = getQuietCategories(entries, "viewed");
  assert.ok(!quiet.some((q) => q.category === "pronoun"));
});

test("gone-quiet is empty for an id not in the list, and for an acute or unanalysed viewed entry", () => {
  const filler = fillerEntries(20, 15, "pronoun");
  assert.deepEqual(getQuietCategories(filler, "missing"), []);
  assert.deepEqual(
    getQuietCategories([acuteEntry({ id: "acute", createdAt: day(2026, 3, 1) }), ...filler], "acute"),
    []
  );
  assert.deepEqual(
    getQuietCategories([entry({ id: "q", createdAt: day(2026, 3, 1), status: "queued" }), ...filler], "q"),
    []
  );
});

test("ordinal formats 1st/2nd/3rd/4th and the 11th-13th irregular teens", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(22), "22nd");
  assert.equal(ordinal(23), "23rd");
  assert.equal(ordinal(101), "101st");
  assert.equal(ordinal(111), "111th");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffWords,
  extractEdits,
  rewriteRatio,
  MAX_LCS_CELLS,
  MAX_REWRITE_RATIO,
} from "../worker/src/diff.ts";
import type { WordEdit } from "../worker/src/diff.ts";

/** Ranges must partition both token arrays end to end, in order, with no gap or overlap. */
function assertPartitions(a: unknown[], b: unknown[], ranges: ReturnType<typeof diffWords>) {
  let aPos = 0;
  let bPos = 0;
  for (const r of ranges) {
    assert.equal(r.aStart, aPos, "a-range must start where the previous one ended");
    assert.equal(r.bStart, bPos, "b-range must start where the previous one ended");
    aPos = r.aEnd;
    bPos = r.bEnd;
  }
  assert.equal(aPos, a.length, "ranges must cover every token of a");
  assert.equal(bPos, b.length, "ranges must cover every token of b");
}

test("identical sentences produce a single equal range and no edits", () => {
  const a = ["I", "am", "a", "geologist"];
  const ranges = diffWords(a, a);
  assert.deepEqual(ranges, [{ op: "equal", aStart: 0, aEnd: 4, bStart: 0, bEnd: 4 }]);
  assert.deepEqual(extractEdits(["I am a geologist"], ["I am a geologist"]), []);
});

test("a single-word replacement is one edit, not a delete next to an insert", () => {
  const ranges = diffWords(["I", "go"], ["I", "went"]);
  assertPartitions(["I", "go"], ["I", "went"], ranges);
  assert.deepEqual(ranges, [
    { op: "equal", aStart: 0, aEnd: 1, bStart: 0, bEnd: 1 },
    { op: "replace", aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
  ]);
  assert.deepEqual(extractEdits(["I go"], ["I went"]), [
    { sentIdx: 0, original: "go", corrected: "went" },
  ]);
});

test("a pure insertion has an empty original", () => {
  const ranges = diffWords(["I", "go", "market"], ["I", "go", "to", "market"]);
  assertPartitions(["I", "go", "market"], ["I", "go", "to", "market"], ranges);
  const edits = extractEdits(["I go market"], ["I go to market"]);
  assert.deepEqual(edits, [{ sentIdx: 0, original: "", corrected: "to" }]);
});

test("a pure deletion has an empty corrected", () => {
  const edits = extractEdits(["I go to to market"], ["I go to market"]);
  assert.deepEqual(edits, [{ sentIdx: 0, original: "to", corrected: "" }]);
});

test("multiple separate edits in one sentence are reported separately", () => {
  const edits = extractEdits(
    ["He go to market yesterday"],
    ["He went to the market yesterday"]
  );
  assert.deepEqual(edits, [
    { sentIdx: 0, original: "go", corrected: "went" },
    { sentIdx: 0, original: "", corrected: "the" },
  ]);
});

test("edits are attributed to the correct sentence when several sentences are diffed", () => {
  const sentences = ["I go to market.", "It was a good day.", "He help me a lot."];
  const corrected = ["I go to the market.", "It was a good day.", "He helped me a lot."];
  const edits = extractEdits(sentences, corrected);
  assert.deepEqual(
    edits.map((e) => e.sentIdx),
    [0, 2]
  );
  assert.deepEqual(edits[0], { sentIdx: 0, original: "", corrected: "the" });
  assert.deepEqual(edits[1], { sentIdx: 2, original: "help", corrected: "helped" });
});

test("completely different sentences become one replace spanning everything", () => {
  const ranges = diffWords(["red", "fox"], ["blue", "whale", "swims"]);
  assertPartitions(["red", "fox"], ["blue", "whale", "swims"], ranges);
  assert.deepEqual(ranges, [
    { op: "replace", aStart: 0, aEnd: 2, bStart: 0, bEnd: 3 },
  ]);
});

test("an empty sentence against a non-empty one is a pure insertion, and vice versa", () => {
  assert.deepEqual(diffWords([], ["hello"]), [
    { op: "replace", aStart: 0, aEnd: 0, bStart: 0, bEnd: 1 },
  ]);
  assert.deepEqual(diffWords(["hello"], []), [
    { op: "replace", aStart: 0, aEnd: 1, bStart: 0, bEnd: 0 },
  ]);
  assert.deepEqual(diffWords([], []), []);
});

test("rewriteRatio counts only words present in the original", () => {
  const sentences = ["one two three four"];
  const insertOnly: WordEdit[] = [{ sentIdx: 0, original: "", corrected: "five" }];
  assert.equal(rewriteRatio(sentences, insertOnly), 0, "a pure insertion changes nothing in the original");

  const replaceTwo: WordEdit[] = [{ sentIdx: 0, original: "two three", corrected: "TWO THREE" }];
  assert.equal(rewriteRatio(sentences, replaceTwo), 0.5);
});

test("rewriteRatio is zero rather than dividing by zero when there are no sentences", () => {
  assert.equal(rewriteRatio([], []), 0);
});

test("a set of edits touching over half the entry trips the over-rewrite guard", () => {
  // Asserts the behaviour the threshold exists for, rather than its literal
  // value — CLAUDE.md's Known Gaps expects MAX_REWRITE_RATIO to be retuned.
  const sentences = ["one two three four"];
  const heavy: WordEdit[] = [{ sentIdx: 0, original: "one two three", corrected: "A B C" }];
  assert.ok(rewriteRatio(sentences, heavy) > MAX_REWRITE_RATIO);

  const light: WordEdit[] = [{ sentIdx: 0, original: "one", corrected: "A" }];
  assert.ok(rewriteRatio(sentences, light) <= MAX_REWRITE_RATIO);
});

// The bug these caught: `original` was rebuilt as tokens.join(" "), so any
// whitespace the learner actually typed — a line break, a double space —
// was normalised away. The span then existed nowhere in the entry, the
// Feedback highlight found nothing, and api.ts's "should never fire"
// substring guard fired instead.
test("an edit's original is a verbatim substring of the sentence it came from", () => {
  const sentence = "I am\nwork in the mine since 2019.";
  const edits = extractEdits([sentence], ["I have worked in the mine since 2019."]);
  assert.ok(edits.length > 0);
  for (const e of edits) {
    assert.ok(sentence.includes(e.original), `${JSON.stringify(e.original)} not in the sentence`);
  }
});

test("a double space inside a changed span survives into the edit", () => {
  const sentence = "I am  work in the mine.";
  const edits = extractEdits([sentence], ["I have worked in the mine."]);
  for (const e of edits) assert.ok(sentence.includes(e.original));
});

test("single-spaced text still produces the plain joined span", () => {
  assert.deepEqual(extractEdits(["I am work in the mine."], ["I have worked in the mine."]), [
    { sentIdx: 0, original: "am work", corrected: "have worked" },
  ]);
});

test("MAX_REWRITE_RATIO stays a fraction of the entry", () => {
  assert.ok(MAX_REWRITE_RATIO > 0 && MAX_REWRITE_RATIO < 1);
});

// The gap these close: the LCS table was quadratic in one "sentence", so an
// unpunctuated ~2400-word entry — one giant sentence to the splitter — could
// exhaust the Worker's memory. Common ends are now trimmed before the table
// is allocated, and a middle too large to diff exactly degrades to a single
// replace instead of allocating without bound.
test("a 2400-word unpunctuated entry with one error diffs exactly", () => {
  const words = Array.from({ length: 2400 }, (_, k) => `w${k}`);
  const sentence = words.join(" ");
  const correctedWords = [...words];
  correctedWords[1200] = "changed";
  const edits = extractEdits([sentence], [correctedWords.join(" ")]);
  assert.deepEqual(edits, [{ sentIdx: 0, original: "w1200", corrected: "changed" }]);
});

test("changes at both ends leave nothing to trim and still diff exactly", () => {
  const a = Array.from({ length: 300 }, (_, k) => `w${k}`);
  const b = [...a];
  b[0] = "first";
  b[299] = "last";
  const ranges = diffWords(a, b);
  assertPartitions(a, b, ranges);
  assert.deepEqual(ranges, [
    { op: "replace", aStart: 0, aEnd: 1, bStart: 0, bEnd: 1 },
    { op: "equal", aStart: 1, aEnd: 299, bStart: 1, bEnd: 299 },
    { op: "replace", aStart: 299, aEnd: 300, bStart: 299, bEnd: 300 },
  ]);
});

test("a middle too large to diff exactly becomes one replace, not an allocation", () => {
  // No shared tokens anywhere, so nothing trims and the exact table would
  // need more than MAX_LCS_CELLS cells.
  const side = Math.ceil(Math.sqrt(MAX_LCS_CELLS)) + 1;
  const a = Array.from({ length: side }, (_, k) => `a${k}`);
  const b = Array.from({ length: side }, (_, k) => `b${k}`);
  const ranges = diffWords(a, b);
  assertPartitions(a, b, ranges);
  assert.deepEqual(ranges, [
    { op: "replace", aStart: 0, aEnd: side, bStart: 0, bEnd: side },
  ]);
});

test("the cap fallback keeps trimmed common ends as equal ranges", () => {
  const side = Math.ceil(Math.sqrt(MAX_LCS_CELLS)) + 1;
  const shared = ["I", "am", "a", "geologist"];
  const a = [...shared, ...Array.from({ length: side }, (_, k) => `a${k}`), ...shared];
  const b = [...shared, ...Array.from({ length: side }, (_, k) => `b${k}`), ...shared];
  const ranges = diffWords(a, b);
  assertPartitions(a, b, ranges);
  assert.deepEqual(ranges, [
    { op: "equal", aStart: 0, aEnd: 4, bStart: 0, bEnd: 4 },
    { op: "replace", aStart: 4, aEnd: 4 + side, bStart: 4, bEnd: 4 + side },
    { op: "equal", aStart: 4 + side, aEnd: a.length, bStart: 4 + side, bEnd: b.length },
  ]);
});

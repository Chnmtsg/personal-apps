import { test } from "node:test";
import assert from "node:assert/strict";
import { diffWords, extractEdits, rewriteRatio, MAX_REWRITE_RATIO } from "../worker/src/diff.ts";
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

test("MAX_REWRITE_RATIO is the documented over-rewrite threshold", () => {
  assert.equal(MAX_REWRITE_RATIO, 0.45);
});

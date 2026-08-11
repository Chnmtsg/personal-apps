import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegments } from "../app/src/lib/highlight.ts";

/** Concatenating the segments must always reproduce the input exactly. */
function assertLossless(text: string, spans: string[]) {
  const segments = buildSegments(text, spans);
  assert.equal(segments.map((s) => s.text).join(""), text);
  return segments;
}

const highlighted = (text: string, spans: string[]) =>
  buildSegments(text, spans)
    .filter((s) => s.highlighted)
    .map((s) => s.text);

test("marks a single span and leaves the rest alone", () => {
  const segments = assertLossless("I am a geologist", ["a geologist"]);
  assert.deepEqual(segments, [
    { text: "I am ", highlighted: false },
    { text: "a geologist", highlighted: true },
  ]);
});

test("a repeated word marks each occurrence in turn, not the first twice", () => {
  // The regression this guards: matching every span from position 0 made two
  // corrections of "the" both land on the first "the" in the entry.
  const text = "the sample and the core";
  const segments = assertLossless(text, ["the", "the"]);
  const marks = segments.filter((s) => s.highlighted);
  assert.equal(marks.length, 2);
  assert.deepEqual(
    segments.map((s) => s.text),
    ["the", " sample and ", "the", " core"]
  );
});

test("matches behind the cursor when corrections arrive out of order", () => {
  assert.deepEqual(highlighted("alpha beta", ["beta", "alpha"]), ["alpha", "beta"]);
});

test("merges overlapping spans into one mark", () => {
  const segments = assertLossless("drill core sample", ["drill core", "core sample"]);
  assert.deepEqual(segments, [{ text: "drill core sample", highlighted: true }]);
});

test("ignores spans that are absent, empty, or in an empty text", () => {
  assert.deepEqual(highlighted("I take three sample", ["missing"]), []);
  assert.deepEqual(highlighted("I take three sample", [""]), []);
  assert.deepEqual(buildSegments("", ["anything"]), []);
});

test("keeps text intact when there are no spans at all", () => {
  assert.deepEqual(buildSegments("untouched", []), [
    { text: "untouched", highlighted: false },
  ]);
});

test("handles a span at the very start and the very end", () => {
  assertLossless("start middle end", ["start", "end"]);
  assert.deepEqual(highlighted("start middle end", ["start", "end"]), ["start", "end"]);
});

// The bug these caught: `indexOf` matched inside a longer word, so a pronoun
// correction on "he" marked the "he" in "The", and an article correction on
// "a" marked the "a" in "make" — the two most frequent correction shapes for
// this learner, both mis-teaching which word was actually wrong.
test("a short span marks a whole word, never letters inside a longer one", () => {
  const segments = assertLossless("The chief he check the data.", ["he"]);
  assert.deepEqual(
    segments.map((s) => s.text),
    ["The chief ", "he", " check the data."]
  );
});

test("a one-letter article span skips the same letter inside another word", () => {
  assert.deepEqual(
    assertLossless("I make a lot of sample.", ["a"]).map((s) => s.text),
    ["I make ", "a", " lot of sample."]
  );
});

test("a span still matches when a longer word contains it earlier in the text", () => {
  assert.deepEqual(highlighted("I go to the theatre.", ["the"]), ["the"]);
  assert.deepEqual(
    assertLossless("I go to the theatre.", ["the"]).map((s) => s.text),
    ["I go to ", "the", " theatre."]
  );
});

test("a span carrying its sentence punctuation still matches", () => {
  // diff.ts emits whitespace-delimited tokens, so trailing punctuation is
  // part of the span — a naive \b word-boundary fix would break this.
  assert.deepEqual(highlighted("I go to market.", ["market."]), ["market."]);
});

test("a span containing a line break matches the entry verbatim", () => {
  // Pairs with diff.ts's verbatim `original`: an entry typed with a newline
  // mid-sentence yields a span with that newline in it.
  assert.deepEqual(highlighted("I am\nwork in the mine.", ["am\nwork"]), ["am\nwork"]);
});

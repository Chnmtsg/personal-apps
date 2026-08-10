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

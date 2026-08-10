import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSentences, reconstructText } from "../worker/src/sentences.ts";

test("splits on sentence-ending punctuation followed by whitespace", () => {
  assert.deepEqual(splitSentences("I go to market. I buy fruit! Is it fresh?"), [
    "I go to market.",
    "I buy fruit!",
    "Is it fresh?",
  ]);
});

test("a single sentence with no internal punctuation stays one sentence", () => {
  assert.deepEqual(splitSentences("I go to market"), ["I go to market"]);
});

test("trims surrounding whitespace and drops blank runs", () => {
  assert.deepEqual(splitSentences("  I go.   I buy.  "), ["I go.", "I buy."]);
});

test("collapses multiple blank lines between sentences", () => {
  assert.deepEqual(splitSentences("First one.\n\n\nSecond one."), ["First one.", "Second one."]);
});

test("an empty string produces no sentences", () => {
  assert.deepEqual(splitSentences(""), []);
  assert.deepEqual(splitSentences("   "), []);
});

test("reconstructText preserves paragraph breaks between corrected sentences", () => {
  const original = "I go to market.\n\nIt was a good day.";
  const sentences = splitSentences(original);
  const corrected = ["I went to the market.", "It was a good day."];
  assert.equal(reconstructText(original, sentences, corrected), "I went to the market.\n\nIt was a good day.");
});

test("reconstructText leaves untouched sentences exactly as they were", () => {
  const original = "He help me a lot.";
  assert.equal(reconstructText(original, ["He help me a lot."], ["He help me a lot."]), original);
});

test("reconstructText handles a repeated sentence by matching left to right", () => {
  const original = "I am tired. I am tired.";
  const corrected = ["I am tired.", "I was tired."];
  assert.equal(reconstructText(original, ["I am tired.", "I am tired."], corrected), "I am tired. I was tired.");
});

test("reconstructText keeps leading and trailing text outside any sentence", () => {
  const original = "  I go.  ";
  assert.equal(reconstructText(original, ["I go."], ["I went."]), "  I went.  ");
});

test("reconstructText is a no-op when there are no sentences", () => {
  assert.equal(reconstructText("just some text", [], []), "just some text");
});

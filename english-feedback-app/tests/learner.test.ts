import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveLevel,
  hasCuratedL1,
  l1NotesFor,
  learnerContext,
} from "../worker/src/learner.ts";

test("curated notes are found regardless of case or spacing", () => {
  assert.ok(hasCuratedL1("Mongolian"));
  assert.ok(hasCuratedL1("  mongolian  "));
  assert.ok(hasCuratedL1("MONGOLIAN"));
  assert.ok(l1NotesFor("Mongolian"));
});

test("a language with no curated notes returns nothing rather than a wrong set", () => {
  assert.equal(l1NotesFor("Portuguese"), undefined);
  assert.equal(l1NotesFor(""), undefined);
  assert.equal(l1NotesFor(undefined), undefined);
});

// The language is text the learner types, so an object-index lookup would let
// "constructor" or "__proto__" dredge something inherited from
// Object.prototype into a paid prompt. The new implementation compares
// against an exact string, which these must never satisfy.
test("an inherited object property is not mistaken for curated notes", () => {
  for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(hasCuratedL1(key), false, key);
    assert.equal(l1NotesFor(key), undefined, key);
  }
});

test("the Mongolian notes carry the bridges, keyed by v2 category ids", () => {
  const notes = l1NotesFor("Mongolian")!;
  // The specific knowledge that makes the feedback worth reading.
  assert.match(notes, /тухай/);
  assert.match(notes, /-ыг/);
  assert.match(notes, /^- article:/m);
  assert.match(notes, /^- copula:/m);
  // The pronoun bridge exists and says NOT to re-explain the rule.
  assert.match(notes, /speed problem/i);
});

test("the learner block states the level, defaulting to B1", () => {
  assert.match(learnerContext({ level: "A2" }), /Level: A2/);
  assert.match(learnerContext(undefined), /Level: not stated — assume B1/);
  assert.equal(effectiveLevel({ level: "C1" }), "C1");
  assert.equal(effectiveLevel(undefined), "B1");
});

test("an unknown language asks for real knowledge, never a guess", () => {
  const context = learnerContext({ nativeLanguage: "Portuguese" });
  assert.match(context, /First language: Portuguese/);
  assert.match(context, /no curated notes for Portuguese/);
  assert.match(context, /your own knowledge/);
});

test("no first language means teach plainly, not guess a transfer cause", () => {
  for (const profile of [undefined, {}, { nativeLanguage: "   " }]) {
    const context = learnerContext(profile);
    assert.match(context, /first language was not given/i);
    assert.match(context, /do not guess/i);
  }
});

test("only the fields that were filled in are stated", () => {
  const context = learnerContext({ nativeLanguage: "Spanish" });
  assert.doesNotMatch(context, /Works or studies in/);
  assert.doesNotMatch(context, /Goal:/);
  const full = learnerContext({ field: "nursing", level: "A2", goal: "better emails" });
  assert.match(full, /Works or studies in: nursing/);
  assert.match(full, /Goal: better emails/);
});

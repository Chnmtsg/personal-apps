import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachAlternatives,
  boundNaturalPhrasings,
  type AlternativeCandidate,
  type NaturalCandidate,
} from "../worker/src/alternatives.ts";

// This is the one place ADR 0002 Part B's alternatives are bounded — the
// prompt is the only other control, and there is deliberately no
// verification stage. Every "must not" in the ADR that concerns alternatives
// is a test here.

function modelCorrections(n: number) {
  return Array.from({ length: n }, () => ({ source: "model" as const }));
}

test("a well-formed candidate passes through unchanged", () => {
  const candidates: AlternativeCandidate[] = [
    { for: 0, phrasings: ["I went to the shop with my sister."] },
  ];
  assert.deepEqual(attachAlternatives(candidates, modelCorrections(1)), [
    { for: 0, phrasings: ["I went to the shop with my sister."] },
  ]);
});

test("an out-of-range `for` is dropped, not clamped", () => {
  const candidates: AlternativeCandidate[] = [
    { for: 5, phrasings: ["A valid sentence."] },
    { for: -1, phrasings: ["Also valid."] },
  ];
  assert.deepEqual(attachAlternatives(candidates, modelCorrections(2)), []);
});

test("a candidate pointing at a pattern-sourced correction is dropped", () => {
  const corrections = [{ source: "pattern" as const }, { source: "model" as const }];
  const candidates: AlternativeCandidate[] = [
    { for: 0, phrasings: ["Should never appear — go/went is mechanical."] },
    { for: 1, phrasings: ["This one is fine."] },
  ];
  assert.deepEqual(attachAlternatives(candidates, corrections), [
    { for: 1, phrasings: ["This one is fine."] },
  ]);
});

test("an over-long phrasing is DROPPED, never truncated", () => {
  const tooLong = "x".repeat(121);
  const okLength = "y".repeat(120);
  const candidates: AlternativeCandidate[] = [{ for: 0, phrasings: [tooLong, okLength] }];
  const result = attachAlternatives(candidates, modelCorrections(1));
  assert.equal(result.length, 1);
  // The surviving list must not contain any prefix of the dropped phrasing —
  // proof it was removed wholesale, not cut down to the cap.
  assert.deepEqual(result[0]!.phrasings, [okLength]);
  assert.ok(!result[0]!.phrasings.some((p) => tooLong.startsWith(p) && p.length < tooLong.length));
});

test("an empty or whitespace-only phrasing is dropped", () => {
  const candidates: AlternativeCandidate[] = [{ for: 0, phrasings: ["", "   ", "A real sentence."] }];
  assert.deepEqual(attachAlternatives(candidates, modelCorrections(1)), [
    { for: 0, phrasings: ["A real sentence."] },
  ]);
});

test("a candidate left with zero phrasings after bounding is dropped entirely", () => {
  const candidates: AlternativeCandidate[] = [{ for: 0, phrasings: ["", "x".repeat(200)] }];
  assert.deepEqual(attachAlternatives(candidates, modelCorrections(1)), []);
});

test("more than 2 phrasings on one candidate is truncated to 2", () => {
  const candidates: AlternativeCandidate[] = [
    { for: 0, phrasings: ["First.", "Second.", "Third."] },
  ];
  const result = attachAlternatives(candidates, modelCorrections(1));
  assert.deepEqual(result[0]!.phrasings, ["First.", "Second."]);
});

test("more than 3 alternatives overall is truncated to 3, keeping the first 3", () => {
  const candidates: AlternativeCandidate[] = [0, 1, 2, 3, 4].map((i) => ({
    for: i,
    phrasings: [`Sentence number ${i}.`],
  }));
  const result = attachAlternatives(candidates, modelCorrections(5));
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((a) => a.for),
    [0, 1, 2]
  );
});

test("no candidates yields no alternatives", () => {
  assert.deepEqual(attachAlternatives([], modelCorrections(3)), []);
});

// ADR 0004 — "How an English speaker might say it". This is the one place
// the teacher's natural-phrasing claim is bounded in code, and the prompt is
// the only other control on it: every "must not" in the ADR that concerns
// natural_phrasings is a test here.

const SENTENCES = [
  "I want to go there again.",
  "The weather was very cold and windy.",
  "I go to the shop yesterday.",
];

test("a well-formed candidate for an uncorrected sentence passes through, with the Worker's own sentence text as `original`", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I'd like to go there again.", note: "Speakers soften 'want' into 'would like'." },
  ];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set([2])), [
    {
      original: "I want to go there again.",
      phrasing: "I'd like to go there again.",
      note: "Speakers soften 'want' into 'would like'.",
    },
  ]);
});

test("an out-of-range index is dropped, not clamped", () => {
  const candidates: NaturalCandidate[] = [{ index: 5, phrasing: "Anything at all." }];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set()), []);
});

test("a negative index is dropped", () => {
  const candidates: NaturalCandidate[] = [{ index: -1, phrasing: "Anything at all." }];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set()), []);
});

test("a sentence that produced any correction is ineligible — disjointness enforced in code", () => {
  const candidates: NaturalCandidate[] = [{ index: 2, phrasing: "I went to the shop yesterday." }];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set([2])), []);
});

test("an empty or whitespace-only phrasing is dropped", () => {
  const candidates: NaturalCandidate[] = [{ index: 0, phrasing: "   " }];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set()), []);
});

test("an over-long phrasing is DROPPED, never truncated", () => {
  const tooLong = "x".repeat(121);
  const candidates: NaturalCandidate[] = [{ index: 0, phrasing: tooLong }];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.deepEqual(result, []);
});

test("a phrasing exactly at the 120-character cap survives", () => {
  const okLength = "y".repeat(120);
  const candidates: NaturalCandidate[] = [{ index: 0, phrasing: okLength }];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0]!.phrasing, okLength);
});

test("a phrasing that differs only by punctuation or case is not actually different, and is dropped", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I want to go there again" }, // dropped trailing period
  ];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set()), []);

  const shoutedSame: NaturalCandidate[] = [{ index: 0, phrasing: "I WANT TO GO THERE AGAIN." }];
  assert.deepEqual(boundNaturalPhrasings(shoutedSame, SENTENCES, new Set()), []);

  const commaOnly: NaturalCandidate[] = [{ index: 1, phrasing: "The weather was very cold, and windy." }];
  assert.deepEqual(boundNaturalPhrasings(commaOnly, SENTENCES, new Set()), []);
});

test("a genuinely different phrasing survives even with light punctuation drift", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I'd like to go there again." },
  ];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.equal(result.length, 1);
});

test("a duplicate index blocks a later, otherwise-valid entry for that index — the first occurrence decides, invalid or not", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "" }, // first occurrence of index 0: invalid, dropped
    { index: 0, phrasing: "I'd like to go there again." }, // never reached: same index already seen
  ];
  assert.deepEqual(boundNaturalPhrasings(candidates, SENTENCES, new Set()), []);
});

test("a duplicate index keeps the first occurrence and drops the rest", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I'd like to go there again." },
    { index: 0, phrasing: "I would love to go there again." },
  ];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0]!.phrasing, "I'd like to go there again.");
});

test("a bad or over-long note is dropped, but the phrasing survives", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I'd like to go there again.", note: "x".repeat(101) },
  ];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0]!.phrasing, "I'd like to go there again.");
  assert.ok(!("note" in result[0]!));
});

test("a whitespace-only note is dropped, not stored as an empty string", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I'd like to go there again.", note: "   " },
  ];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.ok(!("note" in result[0]!));
});

test("more than one candidate is capped at one, keeping the first surviving entry", () => {
  const candidates: NaturalCandidate[] = [
    { index: 0, phrasing: "I'd like to go there again." },
    { index: 1, phrasing: "It was freezing and windy." },
  ];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.equal(result.length, 1);
  assert.equal(result[0]!.original, SENTENCES[0]);
});

test("no candidates yields no natural phrasings", () => {
  assert.deepEqual(boundNaturalPhrasings([], SENTENCES, new Set()), []);
});

test("the sentence index is never returned — only `original`, `phrasing` and optionally `note`", () => {
  const candidates: NaturalCandidate[] = [{ index: 1, phrasing: "It was freezing and windy." }];
  const result = boundNaturalPhrasings(candidates, SENTENCES, new Set());
  assert.deepEqual(Object.keys(result[0]!).sort(), ["original", "phrasing"]);
});

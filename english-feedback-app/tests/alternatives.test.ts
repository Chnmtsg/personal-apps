import { test } from "node:test";
import assert from "node:assert/strict";
import { attachAlternatives, type AlternativeCandidate } from "../worker/src/alternatives.ts";

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

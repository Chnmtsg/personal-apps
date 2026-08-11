import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DETERMINISTIC_PATTERNS,
  JOURNAL_PATTERNS,
  PATTERNS,
  contextualExamplesFor,
} from "../shared/patterns.ts";
import {
  CATEGORY_IDS,
  LEGACY_CATEGORY_MAP,
  TAXONOMY,
  normalizeCategory,
  normalizeSeverity,
  ruleFor,
} from "../shared/taxonomy.ts";
import { applyPatterns, findMatchingHit, labelForHit } from "../worker/src/patterns.ts";

// ---------------------------------------------------------------------------
// Taxonomy v2
// ---------------------------------------------------------------------------

test("every pattern's category exists in the taxonomy", () => {
  for (const p of PATTERNS) {
    assert.ok(CATEGORY_IDS.includes(p.category), `pattern #${p.id}: ${p.category}`);
  }
});

test("every legacy category maps onto a v2 id", () => {
  for (const [legacy, v2] of Object.entries(LEGACY_CATEGORY_MAP)) {
    assert.ok(CATEGORY_IDS.includes(v2), `${legacy} -> ${v2}`);
  }
});

test("normalizeCategory passes v2 through, maps legacy, and never invents", () => {
  assert.equal(normalizeCategory("article"), "article");
  assert.equal(normalizeCategory("articles"), "article");
  assert.equal(normalizeCategory("comma_splice"), "run_on");
  assert.equal(normalizeCategory("topic_fronting"), "word_order");
  assert.equal(normalizeCategory("capitalization"), "capitalisation");
  assert.equal(normalizeCategory("something_new"), "other");
});

test("legacy severities map onto the v2 scale", () => {
  assert.equal(normalizeSeverity("major"), "blocking");
  assert.equal(normalizeSeverity("moderate"), "noticeable");
  assert.equal(normalizeSeverity("minor"), "minor");
  assert.equal(normalizeSeverity("blocking"), "blocking");
});

test("ruleFor picks the band and falls back across bands", () => {
  assert.equal(ruleFor("article", "A2"), TAXONOMY.article.ruleA2);
  assert.equal(ruleFor("article", "B2"), TAXONOMY.article.ruleB1);
  // countability only has a B1 wording — an A1 learner still gets a rule.
  assert.equal(ruleFor("countability", "A1"), TAXONOMY.countability.ruleB1);
  // spelling deliberately has none; callers supply the pair-based fallback.
  assert.equal(ruleFor("spelling", "A2"), undefined);
});

// ---------------------------------------------------------------------------
// Deterministic matcher — every safe pattern must fix its own checklist
// example. Where the regex deliberately fixes less than the YAML's `right`
// (the remainder belongs to the corrector), the expectation says so.
// ---------------------------------------------------------------------------

const PARTIAL_FIXES: Record<number, string> = {
  // The regex fixes the noun; the verb agreement is the corrector's job.
  22: "evidence suggest",
};

test("each deterministic pattern fixes its own example", () => {
  for (const p of DETERMINISTIC_PATTERNS) {
    const { patched, hits } = applyPatterns(p.wrong);
    assert.equal(patched, PARTIAL_FIXES[p.id] ?? p.right, `pattern #${p.id}`);
    assert.ok(hits.some((h) => h.id === p.id), `pattern #${p.id} must record its hit`);
  }
});

test("correct text passes through untouched, with no hits", () => {
  const { patched, hits } = applyPatterns("The weather was very cold and windy.");
  assert.equal(patched, "The weather was very cold and windy.");
  assert.deepEqual(hits, []);
});

test("a sentence-initial match keeps its capital letter", () => {
  const { patched } = applyPatterns("Different than last year, it snowed.");
  assert.equal(patched, "Different from last year, it snowed.");
});

test("a hit records what changed and which checklist item it was", () => {
  const { hits } = applyPatterns("It depends of the grade.");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 53);
  assert.equal(hits[0].category, "preposition");
  assert.equal(hits[0].original, "depends of");
  assert.equal(hits[0].corrected, "depends on");
});

test("several patterns can fire in one sentence", () => {
  const { patched, hits } = applyPatterns("i am agree, it depends of him.");
  assert.equal(patched, "I agree, it depends on him.");
  assert.deepEqual(hits.map((h) => h.id).sort((a, b) => a - b), [27, 53, 79]);
});

// ---------------------------------------------------------------------------
// Labels and edit matching
// ---------------------------------------------------------------------------

test("a pattern edit is labelled from the taxonomy, no model involved", () => {
  const { hits } = applyPatterns("It depends of the grade.");
  const label = labelForHit(hits[0], "A2");
  assert.equal(label.category, "preposition");
  assert.equal(label.severity, TAXONOMY.preposition.severityDefault);
  assert.equal(label.explanation, TAXONOMY.preposition.ruleA2);
  assert.equal(label.patternId, 53);
});

test("a category with no rule wording explains with the pair itself", () => {
  const { hits } = applyPatterns("Its ready.");
  const label = labelForHit(hits[0], "A2");
  assert.equal(label.category, "spelling");
  assert.ok(label.explanation.includes("It's ready"));
});

test("a word-diff edit finds the hit that caused it by containment", () => {
  const { hits } = applyPatterns("It depends of the grade.");
  // The word diff against the original reports only the changed word.
  assert.equal(findMatchingHit({ original: "of", corrected: "on" }, hits), hits[0]);
  assert.equal(findMatchingHit({ original: "grade", corrected: "quality" }, hits), undefined);
  assert.equal(findMatchingHit({ original: "", corrected: "" }, hits), undefined);
});

// ---------------------------------------------------------------------------
// Few-shot retrieval and scope
// ---------------------------------------------------------------------------

test("contextual examples come back only for the asked-for categories", () => {
  const examples = contextualExamplesFor(["article"], 5);
  assert.ok(examples.length > 0 && examples.length <= 5);
  for (const e of examples) {
    assert.equal(e.category, "article");
    assert.equal(e.tier, "contextual");
  }
});

test("the professional tier is excluded from the journal app's map", () => {
  assert.ok(JOURNAL_PATTERNS.every((p) => p.tier !== "professional"));
  assert.equal(PATTERNS.length, 100);
  assert.equal(JOURNAL_PATTERNS.length, 96);
});

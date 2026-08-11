import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentOutputSchema,
  ERROR_CATEGORIES,
  FeedbackSchema,
  LearnerProfileSchema,
} from "../shared/schema.ts";

// FeedbackSchema is the trust boundary for everything written permanently to
// a learner's device: api.ts re-validates every Worker response against it
// before the result is stored. These tests pin what that boundary lets
// through — a silent loosening here would let free-text categories or
// malformed feedback into storage, where it lives forever.

/** A response shaped like what the 9-agent Worker returns, required fields only. */
function minimalFeedback(): Record<string, unknown> {
  return {
    risk: "none",
    corrected_text: "I am a geologist.",
    corrections: [
      {
        original: "I am geologist",
        corrected: "I am a geologist",
        category: "article",
        severity: "noticeable",
        explanation: "English needs an article before a singular countable noun.",
        source: "model",
      },
    ],
  };
}

test("a complete feedback response parses and survives unchanged", () => {
  const full = {
    ...minimalFeedback(),
    teacher_feedback: "Good entry. One thing: articles. This is #1 on your list.",
    highlighted: [0],
    ambiguous: [{ index: 2, question: "Do you still live there, or did you leave?" }],
    fluency_notes: [
      { before: "very much rain", after: "heavy rain", why: "This is the usual pairing." },
    ],
    drills: [
      {
        prompt: "I am ___ geologist.",
        answer: "a",
        distractors: ["the", "an", ""],
        hint: "Any one of a group.",
      },
    ],
    coach_reply: "A whole day at the drill site sounds tiring. What was the best part?",
  };
  const parsed = FeedbackSchema.safeParse(full);
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data, full);
});

test("an acute entry parses with no grammar feedback at all", () => {
  const acute = {
    risk: "acute",
    corrected_text: "the writer's own words, untouched",
    corrections: [],
    coach_reply: "That sounds very heavy. Please talk to someone you trust.",
  };
  assert.ok(FeedbackSchema.safeParse(acute).success);
});

test("a pattern-sourced correction carries its checklist number", () => {
  const body = minimalFeedback();
  (body.corrections as Array<Record<string, unknown>>)[0].source = "pattern";
  (body.corrections as Array<Record<string, unknown>>)[0].pattern_id = 53;
  const parsed = FeedbackSchema.safeParse(body);
  assert.ok(parsed.success);
  assert.equal(parsed.data.corrections[0].pattern_id, 53);
});

test("a category outside the v2 taxonomy is rejected — legacy names included", () => {
  // Legacy names are normalised at READ time for old stored entries; new
  // network data must arrive in v2 form, or the taxonomy drifts again.
  for (const bad of ["articles", "adverb_placement", "made_up"]) {
    const body = minimalFeedback();
    (body.corrections as Array<Record<string, unknown>>)[0].category = bad;
    assert.ok(!FeedbackSchema.safeParse(body).success, bad);
  }
  assert.ok((ERROR_CATEGORIES as readonly string[]).includes("article"));
});

test("severity and source are closed enums", () => {
  for (const severity of ["major", "moderate", "catastrophic"]) {
    const body = minimalFeedback();
    (body.corrections as Array<Record<string, unknown>>)[0].severity = severity;
    assert.ok(!FeedbackSchema.safeParse(body).success, severity);
  }
  const body = minimalFeedback();
  (body.corrections as Array<Record<string, unknown>>)[0].source = "guessed";
  assert.ok(!FeedbackSchema.safeParse(body).success);
});

test("a response missing a required field is rejected, not defaulted", () => {
  for (const field of ["risk", "corrected_text", "corrections"]) {
    const bad = minimalFeedback();
    delete bad[field];
    assert.ok(!FeedbackSchema.safeParse(bad).success, `missing ${field} must be rejected`);
  }
});

test("unknown extra fields are stripped rather than fatal", () => {
  // A newer Worker adding an additive field must not crash an older client.
  const withExtra = { ...minimalFeedback(), brand_new_field: "from a newer worker" };
  const parsed = FeedbackSchema.safeParse(withExtra);
  assert.ok(parsed.success);
  assert.ok(!("brand_new_field" in parsed.data));
});

test("drills require distractors and highlighted ids must be whole numbers", () => {
  const noDistractors = {
    ...minimalFeedback(),
    drills: [{ prompt: "p", answer: "a", hint: "h" }],
  };
  assert.ok(!FeedbackSchema.safeParse(noDistractors).success);

  const fractionalHighlight = { ...minimalFeedback(), highlighted: [0.5] };
  assert.ok(!FeedbackSchema.safeParse(fractionalHighlight).success);
});

// Worker-internal boundary: what the one runtime agent is allowed to hand
// back (ADR 0001).

function minimalAgentOutput(): Record<string, unknown> {
  return {
    risk: "none",
    corrected: ["I am a geologist."],
    ambiguous: [],
    notes: [{ index: 0, category: "article", rule: "English needs an article here." }],
    feedback: "Good entry.",
  };
}

test("the agent's output requires every field, even when empty", () => {
  assert.ok(AgentOutputSchema.safeParse(minimalAgentOutput()).success);
  for (const field of ["risk", "corrected", "ambiguous", "notes", "feedback"]) {
    const bad = minimalAgentOutput();
    delete bad[field];
    assert.ok(!AgentOutputSchema.safeParse(bad).success, `missing ${field}`);
  }
});

test("the agent's risk verdict is a closed two-way choice", () => {
  assert.ok(AgentOutputSchema.safeParse({ ...minimalAgentOutput(), risk: "acute" }).success);
  // "concern" belongs to the retired dedicated classifier, not this agent.
  assert.ok(!AgentOutputSchema.safeParse({ ...minimalAgentOutput(), risk: "concern" }).success);
  assert.ok(!AgentOutputSchema.safeParse({ ...minimalAgentOutput(), risk: "severe" }).success);
});

test("agent notes use the same closed taxonomy the client stores", () => {
  const withLegacy = {
    ...minimalAgentOutput(),
    notes: [{ index: 0, category: "articles", rule: "legacy name" }],
  };
  assert.ok(!AgentOutputSchema.safeParse(withLegacy).success);
});

test("an empty learner profile is valid — the app works before Settings is ever opened", () => {
  const parsed = LearnerProfileSchema.safeParse({});
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data, {});
});

test("over-long profile fields are rejected at the boundary", () => {
  assert.ok(!LearnerProfileSchema.safeParse({ nativeLanguage: "x".repeat(41) }).success);
  assert.ok(LearnerProfileSchema.safeParse({ nativeLanguage: "x".repeat(40) }).success);
  assert.ok(!LearnerProfileSchema.safeParse({ goal: "x".repeat(121) }).success);
});

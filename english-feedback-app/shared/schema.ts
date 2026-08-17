import { z } from "zod";
import {
  CATEGORY_IDS,
  SEVERITIES,
  TAXONOMY,
  type CategoryId,
  type Severity,
} from "./taxonomy.ts";

// ---------------------------------------------------------------------------
// Model — the pipeline runs ONE runtime agent (ADR 0001). The 9-agent library
// in knowledge/agent_prompts.md is the growth map; model tiering returns with
// it. Switch models here, nowhere else.
//
// Caching note: a system prompt below the model's minimum cacheable prefix
// (512 tokens on claude-opus-5) never caches. The teacher prompt clears the
// floor comfortably; verify cache.read on a real request after deploying.
// ---------------------------------------------------------------------------

export const MODEL_ID = "claude-opus-5";

// Bump whenever the teacher prompt changes (prompts/teacher.md is the source;
// the string below is its mirror), so stored feedback stays interpretable.
// 6: the 9-agent pipeline; taxonomy v2.
// 7: collapsed to the single teacher agent (ADR 0001) — inline risk check,
//    minimal correction, per-change notes, teacher message in one call.
// 8: a note may carry optional `alternatives` — at most 2 other correct ways
//    to write that sentence, on at most the 3 changes taught (ADR 0002 B).
// 9: an optional `natural` phrasing — at most 1 per entry, for a sentence
//    the learner got right. Never a correction (ADR 0004).
export const PROMPT_VERSION = 9;

// Mirrors the client-side minimum in Write.tsx, enforced again server-side as
// defense-in-depth against a bypassed or future client — validate before
// spending anything (worker/src/policy.ts).
export const MIN_WORDS = 30;

/** Shared so the client's Analyse gate and the Worker's server-side check
 * (worker/src/policy.ts) can never disagree on what counts as a word. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// 🔴 Taxonomy v2 (shared/taxonomy.ts) — versioned data stored inside every
// entry. The legacy 20-name taxonomy is mapped at read time, never deleted.
export const ERROR_CATEGORIES = CATEGORY_IDS;
export type ErrorCategory = CategoryId;
export type { Severity };

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

// "concern" no longer arrives on new entries (the dedicated distress
// classifier is retired for now) but remains valid stored data.
export const RISK_LEVELS = ["none", "concern", "acute"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

const CategoryEnum = z.enum(ERROR_CATEGORIES);
const SeverityEnum = z.enum(SEVERITIES);

// ---------------------------------------------------------------------------
// Stored feedback — the client validates every /analyze response against this
// before anything reaches IndexedDB, so no free-text category can ever be
// stored. Entries analysed before PROMPT_VERSION 6 carry the legacy fields
// below and are normalised at read time; entries from the 9-agent era may
// carry fields (drills, fluency_notes, coach_reply, highlighted) the current
// pipeline no longer writes. Screens render whatever is present.
// ---------------------------------------------------------------------------

const CorrectionSchema = z.object({
  /** Exact erroneous span — computed by worker/src/diff.ts, never asserted. */
  original: z.string(),
  corrected: z.string(),
  category: CategoryEnum,
  severity: SeverityEnum,
  /** ONE sentence teaching the rule, addressed to the writer. */
  explanation: z.string(),
  /** "pattern" = fixed by the deterministic matcher; "model" = the agent. */
  source: z.enum(["pattern", "model"]),
  /** Checklist number when source is "pattern" — feeds the progress map. */
  pattern_id: z.number().int().optional(),
});

const AmbiguitySchema = z.object({
  /** Sentence index the agent left unchanged rather than guessing. */
  index: z.number().int().min(0),
  question: z.string(),
});

/**
 * "You could also say…" — at most 2 complete, model-written rephrasings of
 * a taught correction's sentence. NOT diff-verified: unlike `Correction`,
 * this is asserted free text, so it lives in its own array, never inside
 * `CorrectionSchema` (ADR 0002 Part B). `for` is an index into `corrections`,
 * assigned by the same reading-order notes→edits zip that labels corrections
 * themselves; `worker/src/alternatives.ts` bounds this in code before it
 * reaches `FeedbackSchema` — dropping an out-of-range `for` or an over-long
 * phrasing rather than truncating it, since a phrasing cut mid-word is
 * broken English shown to a learner as a model of good English.
 */
const AlternativeSchema = z.object({
  for: z.number().int().min(0),
  phrasings: z.array(z.string().max(120)).min(1).max(2),
});

/**
 * "How an English speaker might say it" — ONE more idiomatic way to write a
 * sentence the learner already got right (ADR 0004). Model-asserted free
 * text, NOT diff-verified, exactly like `AlternativeSchema` — which is why it
 * lives here, sibling to `alternatives`, and never inside `CorrectionSchema`.
 * `original` is the learner's own sentence, copied by the Worker from its own
 * sentence split (`worker/src/sentences.ts`); it is never read from the
 * model. `worker/src/alternatives.ts`'s `boundNaturalPhrasings` bounds this
 * in code before it reaches `FeedbackSchema` — dropping (never truncating) an
 * out-of-range index, a sentence that produced any correction, an empty or
 * over-long phrasing, and a phrasing that is not actually different from the
 * learner's own sentence.
 */
const NaturalPhrasingSchema = z.object({
  original: z.string(),
  phrasing: z.string().max(120),
  note: z.string().max(100).optional(),
});

const FluencyNoteSchema = z.object({
  before: z.string(),
  after: z.string(),
  why: z.string(),
});

const DrillSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  distractors: z.array(z.string()),
  hint: z.string(),
});

export const FeedbackSchema = z.object({
  risk: z.enum(RISK_LEVELS),
  corrected_text: z.string(),
  corrections: z.array(CorrectionSchema),
  /** The teacher's message — absent on an acute entry, where grammar
   * feedback is deliberately withheld. */
  teacher_feedback: z.string().optional(),
  /** 9-agent era: indices the teacher voice chose. No longer written. */
  highlighted: z.array(z.number().int().min(0)).optional(),
  ambiguous: z.array(AmbiguitySchema).optional(),
  /** Parallel to `corrections`, never inside it — see `AlternativeSchema`.
   * Bounded to at most 3 by `worker/src/alternatives.ts` before this is
   * ever populated; absent on every entry stored before PROMPT_VERSION 8. */
  alternatives: z.array(AlternativeSchema).max(3).optional(),
  /** "How an English speaker might say it" (ADR 0004) — sibling of
   * `alternatives`, never a union on it: it is keyed to nothing (no
   * correction index, no sentence index), it is not itself a correction, and
   * a sentence that produced a correction is never eligible for one. Bounded
   * to at most 1 by `worker/src/alternatives.ts`'s `boundNaturalPhrasings`
   * before this is ever populated; absent on every entry stored before
   * PROMPT_VERSION 9. */
  natural_phrasings: z.array(NaturalPhrasingSchema).max(1).optional(),
  /** 9-agent era fields — still valid stored data, no longer written. */
  fluency_notes: z.array(FluencyNoteSchema).optional(),
  drills: z.array(DrillSchema).optional(),
  coach_reply: z.string().optional(),
});

/**
 * Fields that only exist on entries stored before PROMPT_VERSION 6. Screens
 * render them when present and must never assume they exist. Their category
 * and severity strings are the legacy taxonomy — normalise via
 * shared/taxonomy.ts before counting or labelling.
 */
export interface LegacyFeedbackFields {
  cefr_estimate?: string;
  patterns?: Array<{ category: string; count: number; explanation: string }>;
  scores?: { grammar: number; vocabulary: number; naturalness: number };
  one_thing_to_fix?: string;
  what_went_well?: string;
  vocabulary?: Array<{ term: string; stress: string; meaning: string; example: string }>;
  pattern_watch?: { category: string; entries_clean: number; note: string; practice: string };
}

/**
 * The shape a correction actually has once it is read back OUT of
 * IndexedDB, as opposed to `CorrectionSchema`'s inferred type, which is only
 * ever true of a fresh /analyze response crossing the network boundary.
 *
 * `category` and `severity` are deliberately `string`, not the v2 enums: a
 * correction stored before taxonomy v2 carries a legacy name the current
 * enum does not have, so a caller MUST route it through `normalizeCategory`
 * / `normalizeSeverity` (shared/taxonomy.ts) rather than trust the type.
 * `explanation` and `source` are optional for the same reason — pre-v2
 * entries have `rule` instead of `explanation`, and no `source` at all.
 */
export type StoredCorrection = {
  original: string;
  corrected: string;
  category: string;
  severity: string;
  /** v2: the one-sentence rule. Absent on pre-v2 entries — see `rule`. */
  explanation?: string;
  /** Pre-v2 name for the same field. */
  rule?: string;
  /** Absent on every entry stored before PROMPT_VERSION 7. */
  source?: "pattern" | "model";
  /** Checklist number when `source` is "pattern". */
  pattern_id?: number;
};

/** Stored feedback: v2 fields, `risk` absent on pre-v2 entries, corrections
 * possibly legacy-shaped. The network schema above stays strict; this type is
 * what screens and stats read back OUT of IndexedDB. */
export type Feedback = Omit<z.infer<typeof FeedbackSchema>, "corrections" | "risk"> & {
  risk?: RiskLevel;
  corrections: StoredCorrection[];
} & LegacyFeedbackFields;

export type Drill = z.infer<typeof DrillSchema>;

/**
 * The exact, strict shape the Worker computes for one /analyze response's
 * `feedback` field — `FeedbackSchema`'s inferred type, used only at that
 * network boundary (worker/src/pipeline.ts). Every field the schema
 * requires is required here too, unlike `Feedback` above, which is what a
 * screen reads back OUT of IndexedDB and must tolerate being legacy or
 * partial. Not named `AnalyzeResult` — `app/src/lib/api.ts` already uses
 * that name for `analyzeText`'s own success/failure union.
 */
export type AnalyzeFeedback = z.infer<typeof FeedbackSchema>;

/** A learner's recurring-category counts, computed client-side from their own
 * entries and sent as request context (never stored server-side). */
export interface RecurringCategory {
  category: ErrorCategory;
  count: number;
  /** How many of the most recent analysed entries did not contain this
   * category — what lets feedback say "this came back after four clean
   * entries" truthfully. */
  cleanStreak?: number;
}

// ---------------------------------------------------------------------------
// The one runtime agent's output — worker-internal, never sent to the client.
// The diff still produces the edit list; `notes` only label the changes the
// agent made, zipped onto diff-confirmed edits in reading order.
// ---------------------------------------------------------------------------

export const AgentOutputSchema = z.object({
  risk: z.enum(["none", "acute"]),
  // Same length and order as the sentences given to it, one per input.
  corrected: z.array(z.string()),
  ambiguous: z.array(AmbiguitySchema),
  notes: z.array(
    z.object({
      index: z.number().int().min(0),
      category: CategoryEnum,
      rule: z.string(),
      /** Optional and loose on purpose: a bad value must degrade, not fail
       * the parse and cost a retry. `worker/src/alternatives.ts` applies the
       * strict bounds (length cap, range check, the 3-entry ceiling) after
       * this has already parsed successfully. */
      alternatives: z.array(z.string()).max(2).optional(),
    })
  ),
  /** Optional and loose on purpose, same reasoning as a note's `alternatives`
   * above: a bad value must degrade, not fail the parse and cost a retry.
   * `worker/src/alternatives.ts`'s `boundNaturalPhrasings` applies the strict
   * bounds (range check, disjointness against corrected sentences, length
   * cap, the "is it actually different" check, the 1-entry ceiling) after
   * this has already parsed successfully (ADR 0004). */
  natural: z
    .array(
      z.object({
        index: z.number().int().min(0),
        phrasing: z.string(),
        note: z.string().optional(),
      })
    )
    .max(1)
    .optional(),
  feedback: z.string(),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/**
 * Who the learner is. Every field is optional: the app must work on first
 * launch, before anyone has filled anything in.
 *
 * Per-user data, so it NEVER goes in a system prompt — it travels in the user
 * message. A per-user system prompt is a different cache entry for every
 * user, which silently triples input cost.
 */
export const LearnerProfileSchema = z.object({
  /** Free text: the world has more first languages than any list we'd ship. */
  nativeLanguage: z.string().max(40).optional(),
  /** What they do or study — the source of examples worth remembering. */
  field: z.string().max(80).optional(),
  /** Self-assessed; absent means "not sure", which is a normal answer. */
  level: z.enum(CEFR_LEVELS).optional(),
  goal: z.string().max(120).optional(),
});
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

// ---------------------------------------------------------------------------
// The teacher prompt — MIRROR of prompts/teacher.md. Edit the source first,
// then this string, then bump PROMPT_VERSION. It is a byte-identical cached
// prefix: NEVER interpolate per-request or per-user data into it; everything
// that varies travels in the user message. The category list and rule cards
// below are generated from the taxonomy — static for every request.
// ---------------------------------------------------------------------------

// Exported so tests/schema.test.ts can rebuild the exact mirrored prompt from
// prompts/teacher.md and its placeholders, rather than re-deriving rule cards
// with a second, potentially drifting implementation.
export const RULE_CARDS = (Object.keys(TAXONOMY) as CategoryId[])
  .filter((id) => TAXONOMY[id].ruleA2 ?? TAXONOMY[id].ruleB1)
  .map((id) => {
    const t = TAXONOMY[id];
    const a2 = t.ruleA2 ? ` A2: ${t.ruleA2}` : "";
    const b1 = t.ruleB1 ? ` B1+: ${t.ruleB1}` : "";
    return `- ${id}:${a2}${b1}`;
  })
  .join("\n");

export const TEACHER_SYSTEM_PROMPT = `You are a patient, experienced English teacher checking a language learner's daily journal entry. You are the only model call in this pipeline: you check risk, correct minimally, label your own changes, and write the day's feedback — one JSON response.

<risk_check>
First read the entry as a person, not a proofreader. Set "risk" to "acute" on any reference to suicide, self-harm, wanting to die, not wanting to exist, a plan, or immediate danger to the writer or others. The writer's English may be broken — judge intent, not fluency: "I am too tired for living" counts. Bias toward "acute" when uncertain; otherwise "none".

When risk is "acute", STOP TEACHING: return the input sentences copied unchanged as "corrected", empty "notes", empty "ambiguous", and an empty "feedback". Never turn a person's crisis into a grammar lesson. The app shows human-written support instead.
</risk_check>

<correction_rules>
1. Make the FEWEST edits that make each sentence correct. A sentence that is already correct comes back byte-identical — learners notice when correct sentences get changed, and it teaches them their correct English was wrong.
2. Never add information, opinions or detail. Never delete content. Leave proper nouns, place names and non-English words alone; do not translate them.
3. Keep the writer's vocabulary, voice, register and sentence length. "happy" does not become "elated". Do not fix style, tone or repetition — only correctness.
4. Preserve the sentence count and order exactly. Never merge or split sentences; fix a run-on with punctuation inside the same array element.
5. If a sentence has more than one plausible reading and the correction depends on which is meant, do NOT pick one. Return it unchanged and add {"index", "question"} to "ambiguous" — one short question to ask the writer.
"corrected" MUST have the same length and order as the input "sentences" array.
</correction_rules>

<notes>
For EVERY change you made, add one entry to "notes": {"index": <sentence index>, "category": "...", "rule": "..."} — in reading order: sentences in order, changes left to right within a sentence. Your edits are verified by a diff of your output against the input; notes only label your changes, they cannot add or dispute one.

"category" comes from this closed list. Never invent a category:
${CATEGORY_IDS.join(", ")}

"rule" is ONE sentence, maximum 20 words, addressed to the writer as "you". Teach the RULE, not the fix — not "should be 'went'" but "past events use the past form: go becomes went." Adapt the approved rule cards below rather than writing your own; a learner who sees three different explanations of articles across three weeks builds no mental model. Use only grammar words the learner knows at their level (stated in the user message): at A1–A2 say "helping verb", not "auxiliary"; "the word before a noun", not "determiner". If the user message carries l1_notes with a bridge for a category, prefer the bridge — it names what the learner already has in their first language. Do not use a bridge for "pronoun": he/she confusion is a speed problem the learner already understands; acknowledge briefly, never re-teach it.

<rules>
${RULE_CARDS}
</rules>

"alternatives" is OPTIONAL, and belongs only on the at most 3 changes you actually teach in "feedback" — never on the others, and never more than 2 on one note. It is the one place you show the writer another way to say what they already wrote.

Each alternative is a COMPLETE sentence, correct on its own, that the writer could have written instead of your corrected sentence — not a fragment, not a phrase, not a rule. It means exactly the same thing: correction rule 2 still holds, so it adds no information, opinion or detail, and drops nothing. It stays in the writer's own words and register at their level, as in correction rule 3 — a word they do not have yet teaches nothing and reads as a rebuke. It must differ from your correction in a real way — a different word order, a different everyday word, a different structure — never only in punctuation or capitalisation. Never a translation, and never a "better" version of a sentence that was already fine. Keep each one short, under 120 characters, so it can be read at a glance. If you teach two changes in the same sentence, put alternatives on one of them only; the writer does not need the same sentence rephrased twice.

Most sentences have one natural phrasing, and then you leave "alternatives" out. That is the normal answer, not a gap — none at all is better than one invented to fill the field. Two is a ceiling, never a target. When "risk" is "acute" there are no notes and no feedback, so there are no alternatives either.
</notes>

<natural_phrasing>
"natural" is OPTIONAL and is at most ONE for the whole entry. It answers a different question from your corrections: not "is this correct?" but "is this what a speaker would actually say?" It belongs only to a sentence you did NOT change — never to one you corrected, which already carries "alternatives", and never to one you flagged as ambiguous, since you cannot keep a meaning you are unsure of.

Offer one only where a fluent speaker would genuinely say the same thing another way. In order of preference: the politeness and modal channel ("I want to" → "I'd like to", "Can you" → "Could you"), then a fixed everyday expression or the normal pairing of words, then a structure a speaker would reliably reach for instead. A sentence that is merely short, simple, plain or repetitive is NOT a candidate — plain correct English is not a fault.

The phrasing is a COMPLETE sentence the writer could have written instead, meaning exactly the same thing: correction rule 2 still holds, so it adds nothing and drops nothing. It must differ in a real way — a comma, a capital letter or one swapped synonym is not a different phrasing. Keep it under 120 characters and inside the words the writer already has at their level. This is a personal daily journal, so aim at everyday English between people who know each other, never a more formal or more written version of what they wrote.

This is never a correction. The sentence still comes back byte-identical in "corrected"; it gets no note and no category, it is not one of the at most 3 corrections you teach, and you do not mention it in "feedback" — the app shows it on its own, telling the writer that both are correct. A journal sentence is addressed to nobody, so it cannot be blunt: "I want to visit my sister" in a diary is NOT a "register" error and must never be corrected as one. Register is a correction only when the sentence, in the form the writer is plainly using it — a request, an instruction, a message to a person — would land badly on the reader.

Return {"index": <sentence index>, "phrasing": "...", "note": "..."}. Give only the index; the app quotes the writer's own sentence from its own copy, so never write their sentence back to it. "note" is optional: one line under 100 characters saying WHY people say it that way — "English softens 'want' into 'would like'" — a rule they can reuse, never a comment on their day.

Most entries warrant nothing here, and then you leave "natural" out entirely. That is the normal, expected answer — none is better than one invented to fill the field. One is a ceiling, never a target. When "risk" is "acute" there are no natural phrasings either.
</natural_phrasing>

<feedback>
"feedback" is the message the learner actually reads. Structure:
1. One sentence of specific, real praise — a construction used correctly, a longer sentence than usual, a good word choice. If entry_number is 1, welcome them instead. Never generic praise.
2. AT MOST 3 corrections: show their words, show the fix, give the rule in one line. Rank blocking severity first, then categories in their recurring patterns, then everything else. Silently ignore the rest — never "and a few smaller things". An overwhelmed learner stops writing, and a learner who stops writing learns nothing.
3. If one category is recurring, say the count plainly — "this is the 14th time articles have come up" — and give the single rule that covers most cases. When the user message lists pattern fixes with checklist numbers, you may name one: "This is #53 on your list — the third time it has come up." A finite numbered list feels like progress; an endless stream of corrections feels like failure.
4. One forward-looking closing line. If an ambiguity was flagged, ask what they meant instead of asserting a correction.
Tone: warm and direct — a good teacher, not a cheerleader and not a red pen. Never flatter, never apologise for correcting, never the word "unfortunately", never compare them to other learners. Second person throughout. Max 160 words, written at the learner's level or barely above it.
</feedback>

Return JSON only:
{"risk": "none", "corrected": ["...", "..."], "ambiguous": [], "notes": [{"index": 0, "category": "...", "rule": "...", "alternatives": ["..."]}], "natural": [{"index": 0, "phrasing": "...", "note": "..."}], "feedback": "..."}

Example — note that the second sentence comes back untouched, not "improved", and gets no natural phrasing at all; that only one note carries "alternatives"; and that the one natural phrasing rides a third sentence you did not correct:
Input: {"sentences": ["Yesterday I go to shop with my sister.", "The weather was very cold and windy.", "I want to go there again."]}
Output: {"risk": "none", "corrected": ["Yesterday I went to the shop with my sister.", "The weather was very cold and windy.", "I want to go there again."], "ambiguous": [], "notes": [{"index": 0, "category": "verb_tense", "rule": "For finished past actions, use the past form: go becomes went.", "alternatives": ["I went to the shop with my sister yesterday.", "Yesterday I went to the store with my sister."]}, {"index": 0, "category": "article", "rule": "English needs 'the' before a place you and the reader both know."}], "natural": [{"index": 2, "phrasing": "I'd like to go there again.", "note": "English softens 'want' into 'would like', and speakers say it far more often."}], "feedback": "Good clear entry — your weather sentence is exactly right. One thing: for yesterday's actions, use the past form: go becomes went. And English needs 'the' before a known place: to the shop. What did you buy?"}

The user message may also contain a KNOWN ERROR PATTERNS section: examples of mistakes this learner's history makes likely. They are reference material — the sentences to correct are only the ones in the "sentences" array.`;

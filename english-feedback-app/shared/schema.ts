import { z } from "zod";

// Single configurable constant — switch models here, nowhere else (§4.5).
export const MODEL_ID = "claude-opus-5";

// Bump whenever CORRECTOR_SYSTEM_PROMPT, SYNTHESIZE_SYSTEM_PROMPT, or
// COACH_SYSTEM_PROMPT changes, so stored feedback stays interpretable (§13).
export const PROMPT_VERSION = 2;

// Mirrors the client-side minimum in Write.tsx, enforced again server-side as
// defense-in-depth against a bypassed or future client — validate before
// spending anything (worker/src/policy.ts).
export const MIN_WORDS = 30;

/** Shared so the client's Analyse gate and the Worker's server-side check
 * (worker/src/policy.ts) can never disagree on what counts as a word. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// 🔴 Fixed taxonomy (§3.5 / §6). Changing an entry breaks every stored entry's
// history — treat as versioned data after shipping.
export const ERROR_CATEGORIES = [
  "articles",           // a / an / the — missing, extra, or wrong
  "noun_number",        // plural -s, countable vs uncountable
  "verb_agreement",     // he work → he works
  "verb_tense",         // wrong tense choice, incl. present perfect
  "verb_form",          // wrong participle, bare -ing, missing auxiliary
  "copula",             // missing "to be"
  "word_order",         // SVO, adverb placement, adjective order
  "preposition",        // wrong or missing preposition
  "topic_fronting",     // "About X, it is…"
  "pronoun",            // he/she, its vs it's, number agreement
  "determiner",         // another/other, each/every, some/any
  "question_form",      // missing inversion or do-support
  "embedded_question",  // "tell me where is it" → "where it is"
  "comma_splice",       // two sentences joined by a comma
  "punctuation",        // other punctuation
  "capitalization",     // languages, nationalities, I, proper nouns
  "collocation",        // do/make, heavy rain, conduct a survey
  "word_choice",        // wrong word, vague words (thing, stuff)
  "register",           // too informal for the context
  "spelling",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const SEVERITIES = ["minor", "moderate", "major"] as const;
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const CorrectionSchema = z.object({
  original: z.string(),   // exact erroneous span — computed by worker/src/diff.ts, never asserted by the model
  corrected: z.string(),  // the corrected span
  category: z.enum(ERROR_CATEGORIES),
  rule: z.string(),       // one sentence: WHY it was wrong
  severity: z.enum(SEVERITIES),
});

const PatternSchema = z.object({
  category: z.enum(ERROR_CATEGORIES),
  count: z.number().int(),
  explanation: z.string(), // why this pattern happens for a Mongolian speaker
});

const ScoresSchema = z.object({
  grammar: z.number().int().min(0).max(100),
  vocabulary: z.number().int().min(0).max(100),
  naturalness: z.number().int().min(0).max(100),
});

const FluencyNoteSchema = z.object({
  before: z.string(),
  after: z.string(),
  why: z.string(),
});

const DrillSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  hint: z.string(),
});

export const FeedbackSchema = z.object({
  corrected_text: z.string(),
  cefr_estimate: z.enum(CEFR_LEVELS),
  corrections: z.array(CorrectionSchema),
  patterns: z.array(PatternSchema),
  scores: ScoresSchema,
  one_thing_to_fix: z.string(),
  what_went_well: z.string(),
  // Additive — absent on every entry analysed before PROMPT_VERSION 2.
  // Screens must render without them rather than assume they exist.
  fluency_notes: z.array(FluencyNoteSchema).optional(),
  drills: z.array(DrillSchema).optional(),
  // A separate, content-only reply — never present on pre-v2 entries, and
  // absent even on v2 ones if that one call happened to fail (§ pipeline.ts:
  // it degrades gracefully rather than failing the whole entry over it).
  coach_reply: z.string().optional(),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

/** A learner's recurring-category counts, computed client-side from their own
 * entries and sent as request context (never stored server-side — §8, §3). */
export interface RecurringCategory {
  category: ErrorCategory;
  count: number;
}

// --- Worker-internal structured-output schemas — never sent to the client ---

export const CorrectorOutputSchema = z.object({
  // Same length and order as the sentences given to it, one per input.
  corrected: z.array(z.string()),
});
export type CorrectorOutput = z.infer<typeof CorrectorOutputSchema>;

const EditLabelSchema = z.object({
  category: z.enum(ERROR_CATEGORIES),
  severity: z.enum(SEVERITIES),
  rule: z.string(),
});
export type EditLabel = z.infer<typeof EditLabelSchema>;

export const SynthesizeOutputSchema = z.object({
  // Same length and order as the edits given to it — the worker zips these
  // back onto the diff's original/corrected pairs to build `corrections`.
  labels: z.array(EditLabelSchema),
  patterns: z.array(PatternSchema),
  scores: ScoresSchema,
  cefr_estimate: z.enum(CEFR_LEVELS),
  one_thing_to_fix: z.string(),
  what_went_well: z.string(),
  fluency_notes: z.array(FluencyNoteSchema),
  drills: z.array(DrillSchema),
});
export type SynthesizeOutput = z.infer<typeof SynthesizeOutputSchema>;

// ---------------------------------------------------------------------------
// Prompts — each is a byte-identical cached prefix (§4.4). NEVER interpolate
// per-request or per-user data into any of these; anything that varies goes
// in the user message instead. Composing MONGOLIAN_LEARNER_DOSSIER into
// SYNTHESIZE_SYSTEM_PROMPT below happens once, at module definition time, so
// the result is still a single static string, not a per-request template.
// ---------------------------------------------------------------------------

const MONGOLIAN_LEARNER_DOSSIER = `THE LEARNER
- Native language: Mongolian. Profession: geologist in the mining industry.
- Current level: approximately IELTS 4.0–4.5 (CEFR A2+/low B1). Target: IELTS 7.5 and professional business English.
- Their errors are systematic transfer errors, not carelessness. Name the system, not just the mistake.

WHY MONGOLIAN SPEAKERS MAKE THESE ERRORS — use this to write every "rule" and pattern "explanation".

1. ARTICLES. Mongolian has no articles at all. This is the single most frequent error.
   Note: Mongolian DOES mark definiteness, via the accusative suffix -ыг/-ийг on specific
   objects. The concept exists; only the mechanism differs.
2. WORD ORDER. Mongolian is SOV and strictly head-final; English is SVO and head-initial.
   Everything modifies leftward in Mongolian and rightward in English. This one difference
   also causes errors 3, 8 and 9 below.
3. POSTPOSITIONS. Mongolian uses postpositions, not prepositions. The postposition «тухай»
   ("about") follows its noun, producing the very common error "About X, it is…". English
   cannot front a topic with "about".
4. TOPIC-PROMINENCE. Mongolian is topic-comment; English is strictly subject-predicate.
   This produces double subjects ("Other things it works like this") and missing dummy
   subjects ("Is raining" for "It is raining").
5. NO COPULA. Mongolian often omits "to be": "Би геологич" = "I geologist".
   Note this sentence needs TWO additions in English: "am" and "a".
6. NO VERB AGREEMENT. Mongolian verbs do not conjugate for person, hence "he work".
7. OPTIONAL PLURALS. Plural marking is optional in Mongolian and usually dropped after a
   numeral, hence "three sample".
8. NO GENDER PRONOUN. «тэр» means he, she, it and that — hence he/she confusion.
9. PRE-NOMINAL RELATIVE CLAUSES. Mongolian places them before the noun; English after.
10. NO PERFECT ASPECT. Hence "I work here since 2019".
11. CASE SUFFIXES, NOT PREPOSITIONS. Mongolian marks the noun's role with a suffix, so the
    small English words (at, in, on, to, of) feel insubstantial and get dropped. They are
    not decoration — they ARE the case system.
12. POLITENESS. Mongolian carries politeness in the pronoun (та/чи). English has no such
    pronoun and moved politeness into modal verbs. "I want X" is not rude in intent — the
    politeness was simply lost in translation. Correct it to "I'd like X".
13. PUNCTUATION. Comma splices are extremely frequent — two complete sentences joined by a
    comma. Flag every one.
14. PHONETIC ORTHOGRAPHY. Mongolian Cyrillic is nearly one-to-one; English spelling is not.
    Expect spelling errors on words they know by ear.`;

// §7 — the corrector's only job is a minimal, faithful rewrite. It does not
// need the Mongolian-transfer dossier (that informs explanations, not fixes),
// and keeping it out keeps this call cheap and focused.
export const CORRECTOR_SYSTEM_PROMPT = `You correct English written by a language learner: a native Mongolian speaker, a geologist in mining, at roughly IELTS 4.0–4.5 (CEFR A2+/low B1).

Rules:
- Make the MINIMUM edits needed for grammatical correctness. Do not improve style and do not rewrite for naturalness — a separate step handles that.
- Never add facts, opinions, or sentences the writer did not write.
- Never delete content. If a sentence is already correct, return it unchanged, word for word.
- Keep the writer's vocabulary level. Do not swap a simple word for a fancier one.
- Fix every grammatical error you find: articles, verb tense and agreement, prepositions, word order, plurals, punctuation, spelling, and word choice that is simply wrong.

Return JSON only: {"corrected": ["sentence 1", "sentence 2", ...]}
The array MUST be the same length as the input array, in the same order — one corrected sentence per input sentence, even when it is unchanged.`;

// §7 — verbatim except for the dossier splice above it. This call receives,
// in the user message: the entry text, the word-level edits a diff already
// found (already verified correct — never second-guess an edit's original/
// corrected text, only label it), and the learner's recurring categories
// from past entries, if any.
export const SYNTHESIZE_SYSTEM_PROMPT = `You are an expert English teacher analysing writing by a Mongolian learner. You are given their original text and a list of word-level edits a diff already computed between it and a minimally-corrected version — your job is to explain and grade, never to re-correct or second-guess an edit's text.

${MONGOLIAN_LEARNER_DOSSIER}

YOUR OUTPUT — return JSON only, matching the required shape:

"labels" — exactly one entry per input edit, SAME LENGTH AND ORDER as the edits you were given. Each has a category (from the provided enum only), a severity, and a "rule": ONE sentence explaining WHY it was wrong, teaching the rule and referencing the Mongolian-transfer cause when relevant. Prefer "English needs an article before a singular countable noun" over "should be 'a geologist'".

"patterns" — group the labelled edits by category and explain the underlying Mongolian-to-English cause using the dossier above. This is the most valuable output: it converts many small errors into a few fixable systems.

"one_thing_to_fix" — the single highest-leverage item to focus on next. Weigh severity AND whether the learner's recurring categories show this keeps coming back; if it does, say how many times. One item only.

"what_went_well" — SPECIFIC and factual: name a structure used correctly. Never generic praise. If a category that was previously frequent for this learner is absent here, say so.

"scores" — grammar/vocabulary/naturalness, 0–100, honest rather than encouraging. This learner explicitly asked to be pushed.

"cefr_estimate" — for this entry alone.

"fluency_notes" — up to 2 places where the corrected text is grammatically fine but a native speaker would phrase it differently. Empty array if nothing stands out; do not invent notes to fill the field.

"drills" — exactly 3 short fill-in-the-blank exercises targeting the learner's single worst category (prefer their recurring categories if any are given, otherwise the most severe category in this entry). Draw vocabulary and topics from THIS entry so practice feels personal. Empty array only if there is truly nothing to target — no edits here and no recurring history.

Use simple, clear English throughout — the learner is at A2+/B1 and must be able to read your feedback. Be direct and factual; do not soften errors and do not praise reflexively, but explain every correction — a correction without a reason teaches nothing.`;

// Deliberately knows nothing about grammar, edits, or categories — it only
// ever sees the raw entry text, so there is nothing for it to comment on.
export const COACH_SYSTEM_PROMPT = `You are a warm, curious reader of someone's daily journal — a native Mongolian speaker learning English. Respond to WHAT they wrote, never to how they wrote it. Never mention grammar, spelling, vocabulary, or English ability in any way. Two to three sentences. End with one question that invites tomorrow's entry. Write in simple, clear English at an A2+/B1 level, since the reply is itself something they must read and understand.`;

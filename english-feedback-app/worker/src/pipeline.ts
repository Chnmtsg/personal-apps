/**
 * The per-entry pipeline: ONE runtime agent, everything else code (ADR 0001).
 *
 *   policy (index.ts) → split (code) → pattern matcher (code) →
 *   THE TEACHER (llm: risk check · minimal correction · ambiguity ·
 *   per-change notes · teacher message · optional alternatives · optional
 *   natural phrasing) → diff (code) → labelling (code) →
 *   alternatives/natural-phrasing bounding (code) → assembled Feedback
 *
 * The model never produces the error list: spans come from diffing its
 * corrected sentences against the learner's ORIGINAL text. Its `notes` only
 * label the changes it made, zipped onto diff-confirmed model edits in
 * reading order; a mismatch degrades that edit's label to "other" with a
 * pair-based explanation rather than inventing anything. Pattern-sourced
 * edits are labelled straight from the taxonomy with no model involvement.
 *
 * A note may also carry `alternatives` — "you could also say" rephrasings
 * (ADR 0002 Part B). Unlike a correction these are asserted, not diffed, so
 * they never enter `corrections`: `alternatives.ts` bounds them in code into
 * a parallel `feedback.alternatives` array that carries no category,
 * severity or pattern_id and so has no route into any statistic.
 *
 * The agent may also return `natural` — at most one "how a speaker would say
 * it" phrasing for a sentence it did NOT correct (ADR 0004). Same trust
 * problem as `alternatives`, same file (`alternatives.ts`)'s
 * `boundNaturalPhrasings`: bounded in code, disjoint from every corrected
 * sentence, `original` supplied by the Worker's own sentence array rather
 * than the model, and the sentence index it rode in on is discarded the
 * moment that lookup is done.
 *
 * `risk: "acute"` short-circuits: no corrections, no teacher message — the
 * client renders the wellbeing screen. Never a grammar lesson for a crisis.
 *
 * Not pure — this is the Anthropic SDK plus Worker runtime, untested for the
 * same reason index.ts is (needs Miniflare). The pure pieces it leans on —
 * patterns.ts, diff.ts, sentences.ts, policy.ts, learner.ts, alternatives.ts
 * — are tested.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AgentOutputSchema,
  MODEL_ID,
  TEACHER_SYSTEM_PROMPT,
  type AgentOutput,
  type AnalyzeFeedback,
  type LearnerProfile,
  type RecurringCategory,
} from "../../shared/schema.ts";
import { contextualExamplesFor } from "../../shared/patterns.ts";
import { TAXONOMY, ruleFor } from "../../shared/taxonomy.ts";
import { splitSentences, reconstructText } from "./sentences";
import { extractEdits, rewriteRatio, MAX_REWRITE_RATIO } from "./diff";
import { applyPatterns, findMatchingHit, labelForHit, type PatternHit } from "./patterns";
import { effectiveLevel, l1NotesFor, learnerContext } from "./learner.ts";
import { attachAlternatives, boundNaturalPhrasings, type AlternativeCandidate } from "./alternatives.ts";

// Covers thinking AND the response together — the response carries the
// corrected sentences, the notes, and a ≤160-word message. Unmeasured.
const MAX_TOKENS = 12_000;

// In-request retries when the agent over-rewrites — this loop runs inside a
// single already-charged /analyze call, it never touches quota again.
const MAX_REWRITE_ATTEMPTS = 2;

export type StageFailure =
  | { kind: "refusal" }
  | { kind: "truncated" }
  | { kind: "upstream"; retryable: boolean };

interface UsageInfo {
  read: number;
  write: number;
}

type StageResult<T> = ({ ok: true; value: T; usage: UsageInfo }) | ({ ok: false } & StageFailure);

/** One structured call to the teacher. Classifies every failure. */
async function callTeacher(
  client: Anthropic,
  userContent: string
): Promise<StageResult<AgentOutput>> {
  let response;
  try {
    response = await client.messages.parse({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      // Explicit rather than implied — max_tokens is sized for it.
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: TEACHER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(AgentOutputSchema) },
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    // Log the error class only — never the entry text (privacy). An
    // APIError's message is the upstream body, text this worker doesn't own.
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    const errorClass = err instanceof Error ? err.constructor.name : "unknown";
    console.error("anthropic_error:", status ?? "no_status", errorClass);
    // Only a rate limit, a server fault, or a connection failure can succeed
    // later; everything else is deterministic for this entry.
    const retryable = status === undefined || status === 429 || status >= 500;
    return { ok: false, kind: "upstream", retryable };
  }

  if (response.stop_reason === "refusal") {
    console.warn("refusal:", response.stop_details?.category ?? "uncategorised");
    return { ok: false, kind: "refusal" };
  }
  if (response.stop_reason === "max_tokens") {
    console.error(`truncated: output exceeded max_tokens=${MAX_TOKENS}`);
    return { ok: false, kind: "truncated" };
  }
  if (!response.parsed_output) return { ok: false, kind: "upstream", retryable: true };
  return {
    ok: true,
    value: response.parsed_output,
    usage: {
      read: response.usage.cache_read_input_tokens ?? 0,
      write: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

/** The per-user, per-entry context block. Everything that varies lives here,
 * never in the system prompt. */
function buildUserContent(
  patched: string[],
  history: RecurringCategory[],
  profile: LearnerProfile | undefined,
  entryNumber: number | undefined,
  patternFixes: PatternHit[],
  hint: string
): string {
  const notes = l1NotesFor(profile?.nativeLanguage);
  const examples = contextualExamplesFor(history.map((h) => h.category), 8);
  const sections = [
    learnerContext(profile),
    `entry_number: ${entryNumber ?? "unknown"}`,
    history.length > 0
      ? `RECURRING PATTERNS (real counts from their stored history — never invent a number):\n${JSON.stringify(history)}`
      : "",
    notes ? `l1_notes (curated contrasts and bridges):\n${notes}` : "",
    patternFixes.length > 0
      ? `PATTERN FIXES already applied by code before you (checklist numbers you may cite):\n${patternFixes
          .map((h) => `- #${h.id}: "${h.original}" -> "${h.corrected}"`)
          .join("\n")}`
      : "",
    examples.length > 0
      ? `KNOWN ERROR PATTERNS this learner's history makes likely (reference only):\n${examples
          .map((e) => `- "${e.wrong}" -> "${e.right}"`)
          .join("\n")}`
      : "",
    JSON.stringify({ sentences: patched }),
  ];
  return sections.filter(Boolean).join("\n\n") + hint;
}

export interface PipelineOutcome {
  feedback: AnalyzeFeedback;
  cache: UsageInfo;
}

/**
 * How many upstream Anthropic calls this run made — one per `callTeacher`
 * attempt, including retries from the over-rewrite loop. `index.ts` charges
 * one call up front, before this runs, and settles the difference against
 * the global spend ceiling once it knows the real count. This module reports
 * the number; it has no idea what a ceiling or a KV namespace is (ADR 0001's
 * boundary: the pipeline is Env-free).
 */
export async function runPipeline(
  client: Anthropic,
  text: string,
  history: RecurringCategory[],
  profile: LearnerProfile | undefined,
  entryNumber?: number
): Promise<
  | { ok: true; value: PipelineOutcome; calls: number }
  | ({ ok: false; calls: number } & StageFailure)
> {
  const sentences = splitSentences(text);

  // Deterministic pattern fixes first: zero cost, zero hallucination, and the
  // agent gets an easier job. The ORIGINAL sentences are kept for the diff,
  // so the learner sees their own sentence, not a half-fixed one.
  const perSentence = sentences.map(applyPatterns);
  const patched = perSentence.map((r) => r.patched);
  const hitsBySentence = perSentence.map((r) => r.hits);
  const allHits = hitsBySentence.flat();

  // The one model call, retried in-request when it over-rewrites. The ratio
  // measures the MODEL's edits — against the patched text — so certain,
  // code-made pattern fixes never count against it.
  let agent: AgentOutput | undefined;
  let usage: UsageInfo = { read: 0, write: 0 };
  let hint = "";
  let callsMade = 0;
  for (let attempt = 0; attempt <= MAX_REWRITE_ATTEMPTS; attempt++) {
    callsMade++;
    const result = await callTeacher(
      client,
      buildUserContent(patched, history, profile, entryNumber, allHits, hint)
    );
    if (!result.ok) return { ...result, calls: callsMade };
    usage = { read: usage.read + result.usage.read, write: usage.write + result.usage.write };

    const isLastAttempt = attempt === MAX_REWRITE_ATTEMPTS;
    if (result.value.risk === "acute") {
      agent = result.value;
      break;
    }
    if (result.value.corrected.length !== patched.length) {
      // A shape problem, not a verdict on the text.
      if (!isLastAttempt) continue;
      return { ok: false, kind: "upstream", retryable: true, calls: callsMade };
    }
    const ratio = rewriteRatio(patched, extractEdits(patched, result.value.corrected));
    if (ratio <= MAX_REWRITE_RATIO || isLastAttempt) {
      if (ratio > MAX_REWRITE_RATIO) {
        console.warn(`high_rewrite_ratio=${ratio.toFixed(2)}: proceeding after ${attempt} retries`);
      }
      agent = result.value;
      break;
    }
    hint = `\n\nYour previous correction changed ${Math.round(
      ratio * 100
    )}% of the words — far more than a minimal grammar fix requires. Undo any rewording that was not strictly necessary for correctness.`;
  }
  if (!agent) throw new Error("runPipeline: exhausted attempts without a result");

  if (agent.risk === "acute") {
    // Never make the person's crisis into a grammar lesson: no corrections,
    // no teacher message. The client shows human-written support.
    return {
      ok: true,
      value: {
        feedback: { risk: "acute", corrected_text: text, corrections: [] },
        cache: usage,
      },
      calls: callsMade,
    };
  }

  // All edits, diffed against the learner's own text — spans stay verbatim.
  const edits = extractEdits(sentences, agent.corrected);

  // Notes queued per sentence, consumed in reading order by the model's own
  // edits. Pattern-sourced edits never consume one: the model did not make
  // those changes, so it wrote no note for them.
  const noteQueues = new Map<
    number,
    Array<{ category: string; rule: string; alternatives?: string[] }>
  >();
  for (const n of agent.notes) {
    if (n.index < 0 || n.index >= sentences.length) continue;
    const q = noteQueues.get(n.index) ?? [];
    q.push({ category: n.category, rule: n.rule, alternatives: n.alternatives });
    noteQueues.set(n.index, q);
  }

  // Raw candidates for "You could also say…", keyed to the position each
  // model-sourced correction ends up at in `corrections` below — the same
  // reading-order zip that labels the correction also owns its alternatives.
  // Bounded in code, not trusted from the model: see alternatives.ts.
  const alternativeCandidates: AlternativeCandidate[] = [];

  const level = effectiveLevel(profile);
  const corrections: AnalyzeFeedback["corrections"] = edits.map((edit, correctionIndex) => {
    const hit = findMatchingHit(edit, hitsBySentence[edit.sentIdx] ?? []);
    if (hit) {
      const l = labelForHit(hit, level);
      return {
        original: edit.original,
        corrected: edit.corrected,
        category: l.category,
        severity: l.severity,
        explanation: l.explanation,
        source: "pattern",
        pattern_id: l.patternId,
      };
    }
    const note = noteQueues.get(edit.sentIdx)?.shift();
    const category = (note?.category ?? "other") as AnalyzeFeedback["corrections"][number]["category"];
    const explanation =
      note?.rule ??
      ruleFor(category, level) ??
      `In English this is written “${edit.corrected || "(nothing)"}”, not “${edit.original || "(nothing)"}”.`;
    if (note?.alternatives && note.alternatives.length > 0) {
      alternativeCandidates.push({ for: correctionIndex, phrasings: note.alternatives });
    }
    return {
      original: edit.original,
      corrected: edit.corrected,
      category,
      severity: TAXONOMY[category].severityDefault,
      explanation,
      source: "model",
    };
  });

  const alternatives = attachAlternatives(alternativeCandidates, corrections);
  const ambiguous = agent.ambiguous.filter((a) => a.index >= 0 && a.index < sentences.length);
  const teacherFeedback = agent.feedback.trim();

  // "How an English speaker might say it" (ADR 0004) — a sentence the
  // learner got right, so it is disjoint from every sentence that produced a
  // correction, pattern-sourced or model-sourced. The Worker's own sentence
  // array supplies `original`; the model's index is consumed and discarded
  // by boundNaturalPhrasings, never carried past it.
  const correctedSentenceIndices = new Set(edits.map((e) => e.sentIdx));
  const naturalPhrasings = boundNaturalPhrasings(agent.natural ?? [], sentences, correctedSentenceIndices);

  const feedback: AnalyzeFeedback = {
    risk: "none",
    corrected_text: reconstructText(text, sentences, agent.corrected),
    corrections,
    ...(teacherFeedback ? { teacher_feedback: teacherFeedback } : {}),
    ...(ambiguous.length > 0 ? { ambiguous } : {}),
    ...(alternatives.length > 0 ? { alternatives } : {}),
    ...(naturalPhrasings.length > 0 ? { natural_phrasings: naturalPhrasings } : {}),
  };

  return { ok: true, value: { feedback, cache: usage }, calls: callsMade };
}

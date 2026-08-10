/**
 * Orchestrates the analysis pipeline: corrector → diff (code, no LLM) →
 * synthesize, with a content-only coach reply running in parallel.
 *
 * Not pure — this is the Anthropic SDK plus Worker runtime, same as
 * `index.ts` today, and untested for the same reason (§ Known Gaps: testing
 * it needs Miniflare). The pure pieces it leans on — `diff.ts`,
 * `sentences.ts`, `policy.ts` — are tested directly.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
import {
  CORRECTOR_SYSTEM_PROMPT,
  SYNTHESIZE_SYSTEM_PROMPT,
  COACH_SYSTEM_PROMPT,
  CorrectorOutputSchema,
  SynthesizeOutputSchema,
  MODEL_ID,
  type Feedback,
  type RecurringCategory,
  type SynthesizeOutput,
} from "../../shared/schema";
import { splitSentences, reconstructText } from "./sentences";
import { extractEdits, rewriteRatio, MAX_REWRITE_RATIO, type WordEdit } from "./diff";

// Narrow, single-purpose calls need far less headroom than the original
// monolithic one did. Unmeasured against real traffic — see Known Gaps.
const MAX_TOKENS_CORRECTOR = 8000;
const MAX_TOKENS_SYNTHESIZE = 16000;
const MAX_TOKENS_COACH = 2000;

// In-request retries when the corrector over-rewrites, bounded separately
// from the client's cross-request retry budget (MAX_ATTEMPTS in
// app/src/lib/retry.ts) — this loop runs inside a single already-charged
// /analyze call, it never touches quota again.
const MAX_REWRITE_ATTEMPTS = 2;

export type StageFailure =
  | { kind: "refusal" }
  | { kind: "truncated" }
  | { kind: "upstream"; retryable: boolean };

type StageResult<T> = ({ ok: true; value: T; usage: UsageInfo }) | ({ ok: false } & StageFailure);

interface UsageInfo {
  read: number;
  write: number;
}

function usageOf(response: {
  usage: { cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}): UsageInfo {
  return {
    read: response.usage.cache_read_input_tokens ?? 0,
    write: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Runs one Anthropic call, classifying a thrown error into upstream/retryable. */
async function callAnthropic<R>(
  fn: () => Promise<R>
): Promise<{ ok: true; value: R } | ({ ok: false } & StageFailure)> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    // Log the error class only — never the entry text (privacy, §3.6).
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    console.error(
      "anthropic_error:",
      status ?? "no_status",
      err instanceof Error ? err.message : "unknown"
    );
    // 401/403 mean the key is wrong or lacks access — retrying cannot fix
    // it, and letting the client requeue would spin against a dead config.
    const retryable = status !== 401 && status !== 403;
    return { ok: false, kind: "upstream", retryable };
  }
}

/** Refusal and truncation are classified the same way for every stage. */
function classifyStop<
  R extends { stop_reason: string | null; stop_details?: { category?: string | null } | null },
>(response: R, maxTokens: number): { ok: true; value: R } | ({ ok: false } & StageFailure) {
  if (response.stop_reason === "refusal") {
    console.warn("refusal:", response.stop_details?.category ?? "uncategorised");
    return { ok: false, kind: "refusal" };
  }
  if (response.stop_reason === "max_tokens") {
    console.error(`truncated: output exceeded max_tokens=${maxTokens}`);
    return { ok: false, kind: "truncated" };
  }
  return { ok: true, value: response };
}

async function callStructured<T>(
  client: Anthropic,
  system: string,
  userContent: string,
  schema: ZodType<T>,
  maxTokens: number
): Promise<StageResult<T>> {
  const called = await callAnthropic(() =>
    client.messages.parse({
      model: MODEL_ID,
      max_tokens: maxTokens,
      // Explicit rather than implied — see shared/schema.ts's MODEL_ID note
      // on why relying on the default is how max_tokens got mis-sized before.
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: userContent }],
    })
  );
  if (!called.ok) return called;

  const classified = classifyStop(called.value, maxTokens);
  if (!classified.ok) return classified;

  const response = classified.value;
  if (!response.parsed_output) return { ok: false, kind: "upstream", retryable: true };
  return { ok: true, value: response.parsed_output, usage: usageOf(response) };
}

async function callText(
  client: Anthropic,
  system: string,
  userContent: string,
  maxTokens: number
): Promise<StageResult<string>> {
  const called = await callAnthropic(() =>
    client.messages.create({
      model: MODEL_ID,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    })
  );
  if (!called.ok) return called;

  const classified = classifyStop(called.value, maxTokens);
  if (!classified.ok) return classified;

  const block = classified.value.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : undefined;
  if (!text) return { ok: false, kind: "upstream", retryable: true };
  return { ok: true, value: text, usage: usageOf(classified.value) };
}

interface CorrectorResult {
  sentences: string[];
  corrected: string[];
  edits: WordEdit[];
}

/**
 * Corrects the entry, verified by re-diffing its own output. Retries, with a
 * hint appended to the next attempt's user message, when the correction
 * changed far more of the text than a minimal grammar fix should have. If
 * still over budget after retrying, proceeds with the last attempt rather
 * than inventing a new failure state — logged, not silently accepted.
 */
async function runCorrector(client: Anthropic, text: string): Promise<StageResult<CorrectorResult>> {
  const sentences = splitSentences(text);
  let hint = "";

  for (let attempt = 0; attempt <= MAX_REWRITE_ATTEMPTS; attempt++) {
    const userContent = JSON.stringify({ sentences }) + hint;
    const result = await callStructured(
      client,
      CORRECTOR_SYSTEM_PROMPT,
      userContent,
      CorrectorOutputSchema,
      MAX_TOKENS_CORRECTOR
    );
    if (!result.ok) return result;

    const { corrected } = result.value;
    const isLastAttempt = attempt === MAX_REWRITE_ATTEMPTS;

    if (corrected.length !== sentences.length) {
      // The model didn't return one corrected sentence per input sentence —
      // a shape problem, not a verdict on the text.
      if (!isLastAttempt) continue;
      return { ok: false, kind: "upstream", retryable: true };
    }

    const edits = extractEdits(sentences, corrected);
    const ratio = rewriteRatio(sentences, edits);
    if (ratio <= MAX_REWRITE_RATIO || isLastAttempt) {
      if (ratio > MAX_REWRITE_RATIO) {
        console.warn(`high_rewrite_ratio=${ratio.toFixed(2)}: proceeding after ${attempt} retries`);
      }
      return { ok: true, value: { sentences, corrected, edits }, usage: result.usage };
    }

    hint = `\n\nYour previous correction changed ${Math.round(
      ratio * 100
    )}% of the words — far more than a minimal grammar fix requires. Undo any rewording that was not strictly necessary for correctness.`;
  }

  // Unreachable: every branch above returns by the final iteration.
  throw new Error("runCorrector: exhausted attempts without returning");
}

async function runSynthesize(
  client: Anthropic,
  text: string,
  edits: WordEdit[],
  history: RecurringCategory[]
): Promise<StageResult<SynthesizeOutput>> {
  const userContent = JSON.stringify({
    entry: text,
    edits: edits.map((e) => ({ original: e.original, corrected: e.corrected })),
    recurring: history,
  });
  const result = await callStructured(
    client,
    SYNTHESIZE_SYSTEM_PROMPT,
    userContent,
    SynthesizeOutputSchema,
    MAX_TOKENS_SYNTHESIZE
  );
  if (!result.ok) return result;
  if (result.value.labels.length !== edits.length) {
    // Shape problem — surfacing this as a mislabeled edit would be worse
    // than asking the client to retry the whole entry.
    return { ok: false, kind: "upstream", retryable: true };
  }
  return result;
}

function assembleFeedback(
  original: string,
  corrector: CorrectorResult,
  synth: SynthesizeOutput,
  coachReply: string | undefined
): Feedback {
  return {
    corrected_text: reconstructText(original, corrector.sentences, corrector.corrected),
    cefr_estimate: synth.cefr_estimate,
    corrections: corrector.edits.map((edit, i) => ({
      original: edit.original,
      corrected: edit.corrected,
      category: synth.labels[i].category,
      rule: synth.labels[i].rule,
      severity: synth.labels[i].severity,
    })),
    patterns: synth.patterns,
    scores: synth.scores,
    one_thing_to_fix: synth.one_thing_to_fix,
    what_went_well: synth.what_went_well,
    fluency_notes: synth.fluency_notes,
    drills: synth.drills,
    coach_reply: coachReply,
  };
}

export interface PipelineOutcome {
  feedback: Feedback;
  cache: UsageInfo;
}

/**
 * Runs the full pipeline for one entry. A refusal or truncation from the
 * corrector or the synthesize call fails the whole entry — those fields are
 * required, matching how a single-call refusal was handled before. The coach
 * reply is the one optional field in the schema and needs only the raw text,
 * so it runs alongside the rest and degrades to "absent" on failure instead
 * of discarding grammar teaching that already succeeded.
 */
export async function runPipeline(
  client: Anthropic,
  text: string,
  history: RecurringCategory[]
): Promise<{ ok: true; value: PipelineOutcome } | ({ ok: false } & StageFailure)> {
  const coachPromise = runCoach(client, text);

  const correctorResult = await runCorrector(client, text);
  if (!correctorResult.ok) return correctorResult;

  const synthResult = await runSynthesize(client, text, correctorResult.value.edits, history);
  if (!synthResult.ok) return synthResult;

  const coachResult = await coachPromise;
  let coachReply: string | undefined;
  if (coachResult.ok) {
    coachReply = coachResult.value;
  } else {
    console.warn(`coach_reply_unavailable: ${coachResult.kind}`);
  }

  const feedback = assembleFeedback(text, correctorResult.value, synthResult.value, coachReply);

  const parts = [correctorResult, synthResult, ...(coachResult.ok ? [coachResult] : [])];
  const cache = parts.reduce(
    (sum, p) => ({ read: sum.read + p.usage.read, write: sum.write + p.usage.write }),
    { read: 0, write: 0 }
  );

  return { ok: true, value: { feedback, cache } };
}

function runCoach(client: Anthropic, text: string): Promise<StageResult<string>> {
  return callText(client, COACH_SYSTEM_PROMPT, text, MAX_TOKENS_COACH);
}

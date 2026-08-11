/**
 * Deterministic known-pattern matcher. Runs on each sentence BEFORE the
 * corrector: these fixes are certain in a way no model output is, they cost
 * nothing, and removing the mechanical errors first lets the corrector spend
 * its attention on the contextual ones — articles, tense, word order — where
 * it actually adds value.
 *
 * Every hit carries its pattern id, so downstream nothing needs to classify
 * it: the taxonomy supplies the category, severity and explanation directly,
 * and the Error Tutor is never called for these edits.
 *
 * Pure: no Worker runtime, no fetch — tested under bare Node like diff.ts.
 */

import { DETERMINISTIC_PATTERNS, type PatternSpec } from "../../shared/patterns.ts";
import { TAXONOMY, ruleFor, type CategoryId, type Severity } from "../../shared/taxonomy.ts";

export interface PatternHit {
  id: number;
  category: CategoryId;
  /** The text the pattern matched, verbatim from the (progressively patched) sentence. */
  original: string;
  /** What it became. */
  corrected: string;
}

// The YAML marks these `replace: null` — the fix needs a word table, not a
// backreference. Each fixer receives the raw captures for its own regex.
const STATIVE_BASE: Record<string, string> = {
  knowing: "know",
  wanting: "want",
  needing: "need",
  liking: "like",
  believing: "believe",
  understanding: "understand",
};

const IRREGULAR_BASE: Record<string, string> = {
  went: "go",
  saw: "see",
  came: "come",
  took: "take",
  made: "make",
  got: "get",
  had: "have",
  did: "do",
  ate: "eat",
  gave: "give",
};

const FIXERS: Record<NonNullable<PatternSpec["fixId"]>, (captures: string[]) => string> = {
  // "am knowing" -> "know": the auxiliary goes away entirely.
  strip_progressive: (c) => STATIVE_BASE[c[1].toLowerCase()] ?? c[1],
  // "didn't went" -> "didn't go", keeping the writer's own didn't/didnt.
  irregular_past: (c) => `${c[0]} ${IRREGULAR_BASE[c[1].toLowerCase()] ?? c[1]}`,
  // "cans" -> "can".
  modal_s: (c) => c[0].slice(0, -1),
  // "I no have" -> "I don't have".
  no_negation: (c) => `${c[0]} don't ${c[1]}`,
};

/** Substitute $1..$9 from captures; an unmatched optional group becomes "". */
function substitute(template: string, captures: string[]): string {
  return template.replace(/\$(\d)/g, (_, d: string) => captures[Number(d) - 1] ?? "");
}

/**
 * "Different than" must not become "different from" mid-correction: when the
 * matched text opened with a capital and the replacement lost it, restore it.
 */
function preserveCase(matched: string, replaced: string): string {
  const m = matched.charAt(0);
  const r = replaced.charAt(0);
  if (m >= "A" && m <= "Z" && r >= "a" && r <= "z") {
    return r.toUpperCase() + replaced.slice(1);
  }
  return replaced;
}

/**
 * Apply every safe pattern to one sentence, in checklist order. Patterns run
 * on the progressively patched text, so a later pattern sees earlier fixes.
 */
export function applyPatterns(sentence: string): { patched: string; hits: PatternHit[] } {
  let patched = sentence;
  const hits: PatternHit[] = [];
  for (const spec of DETERMINISTIC_PATTERNS) {
    // Clone: a shared `g` regex carries lastIndex state between calls.
    const re = new RegExp(spec.find!.source, spec.find!.flags);
    patched = patched.replace(re, (...args) => {
      const matched = args[0] as string;
      const captures = args.slice(1, -2).map((c) => (typeof c === "string" ? c : "")) as string[];
      const raw = spec.fixId ? FIXERS[spec.fixId](captures) : substitute(spec.replace!, captures);
      const replaced = preserveCase(matched, raw);
      if (replaced === matched) return matched;
      hits.push({ id: spec.id, category: spec.category, original: matched, corrected: replaced });
      return replaced;
    });
  }
  return { patched, hits };
}

export interface PatternLabel {
  category: CategoryId;
  severity: Severity;
  explanation: string;
  patternId: number;
}

/**
 * The label a pattern-sourced edit gets straight from the taxonomy — no model
 * call. Where the taxonomy has no rule wording (spelling), the pair itself is
 * the clearest explanation a learner can get.
 */
export function labelForHit(hit: PatternHit, level: string | undefined): PatternLabel {
  const explanation =
    ruleFor(hit.category, level) ??
    `In English this is written “${hit.corrected}”, not “${hit.original}”.`;
  return {
    category: hit.category,
    severity: TAXONOMY[hit.category].severityDefault,
    explanation,
    patternId: hit.id,
  };
}

/**
 * Match one word-diff edit back to the pattern hit that caused it, if any.
 *
 * The diff runs against the learner's ORIGINAL text (so every span is
 * verbatim theirs), while hits recorded what the matcher changed — usually a
 * longer span ("depends of" -> "depends on") than the word diff reports
 * ("of" -> "on"). Containment is the bridge. A heuristic, not a proof: a
 * coincidental model edit inside a matched phrase can inherit the pattern's
 * label, which mislabels its source but never its text.
 */
export function findMatchingHit(
  edit: { original: string; corrected: string },
  hits: PatternHit[]
): PatternHit | undefined {
  if (edit.original === "" && edit.corrected === "") return undefined;
  const o = edit.original.toLowerCase();
  const c = edit.corrected.toLowerCase();
  return hits.find(
    (h) =>
      (o === "" || h.original.toLowerCase().includes(o)) &&
      (c === "" || h.corrected.toLowerCase().includes(c))
  );
}

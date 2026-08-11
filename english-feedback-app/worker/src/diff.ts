/**
 * Word-level diff between an entry's sentences and their corrected versions.
 *
 * Node has no `difflib`. This is an LCS-based equivalent of
 * `difflib.SequenceMatcher.get_opcodes()`, specialised to the two things the
 * pipeline needs: which spans changed (`diffWords` / `extractEdits`), and how
 * much changed (`rewriteRatio`).
 *
 * This is what makes a correction's `original`/`corrected` text provably
 * correct — computed from the two texts, never asserted by a model.
 */

export type DiffOp = "equal" | "replace";

export interface DiffRange {
  op: DiffOp;
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

interface Token {
  text: string;
  start: number;
  end: number;
}

/**
 * Tokens with their offsets in the source sentence, so an edit's text can be
 * sliced back out verbatim. Re-joining tokens with a single space instead
 * normalises whatever whitespace the learner typed, and a normalised span is
 * no longer findable in the entry — the client's highlight silently finds
 * nothing and `api.ts`'s substring guard fires.
 */
function tokenizeWithOffsets(sentence: string): Token[] {
  const tokens: Token[] = [];
  for (const m of sentence.matchAll(/\S+/g)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function tokenize(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean);
}

/** The source text spanned by tokens [start, end), verbatim. Empty if none. */
function sliceTokens(source: string, tokens: Token[], start: number, end: number): string {
  if (start >= end) return "";
  return source.slice(tokens[start]!.start, tokens[end - 1]!.end);
}

/**
 * Ceiling on the LCS table, in cells. The table is the diff's quadratic cost:
 * one unpunctuated "sentence" of W words costs roughly W² cells against its
 * correction, and as row-per-row JS arrays a ~2400-word entry was enough to
 * exhaust the Worker's 128 MB isolate. 9M cells is a 36 MB flat Uint32Array —
 * a ~3000×3000-word sentence pair after trimming, beyond anything the 10 KB
 * body limit admits as ordinary prose. A middle larger than this is reported
 * as one replace instead of allocating without bound.
 */
export const MAX_LCS_CELLS = 9_000_000;

/**
 * Diffs two token arrays. A run of consecutive non-matching tokens — deletes,
 * inserts, or a mix of both — becomes a single "replace" range rather than
 * adjacent delete/insert ranges, so a substitution reads as one edit.
 * `aStart === aEnd` means a pure insertion; `bStart === bEnd` means a pure
 * deletion.
 */
export function diffWords(a: string[], b: string[]): DiffRange[] {
  // Trim the common prefix and suffix before the quadratic part: corrections
  // touch a small share of a sentence, so this is what keeps the table small
  // for a long sentence. It changes no result — the walk below takes an equal
  // step wherever tokens match, so trimmed ends always came back as these
  // same equal runs.
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let aHi = a.length;
  let bHi = b.length;
  while (aHi > lo && bHi > lo && a[aHi - 1] === b[bHi - 1]) {
    aHi--;
    bHi--;
  }

  const ranges: DiffRange[] = [];
  if (lo > 0) ranges.push({ op: "equal", aStart: 0, aEnd: lo, bStart: 0, bEnd: lo });
  appendMiddleRanges(a, b, lo, aHi, bHi, ranges);
  if (aHi < a.length) {
    ranges.push({ op: "equal", aStart: aHi, aEnd: a.length, bStart: bHi, bEnd: b.length });
  }
  return ranges;
}

/**
 * Diffs the trimmed middle `a[lo:aHi)` vs `b[lo:bHi)` and appends its ranges.
 * The first and last middle tokens differ by construction, so the first and
 * last appended range is never "equal" and cannot need merging with the
 * trimmed ends.
 */
function appendMiddleRanges(
  a: string[],
  b: string[],
  lo: number,
  aHi: number,
  bHi: number,
  ranges: DiffRange[]
): void {
  const n = aHi - lo;
  const m = bHi - lo;
  if (n === 0 && m === 0) return;

  // One-sided middles are a pure insertion or deletion; an oversized one is
  // one replace spanning everything that changed — degraded (the learner gets
  // a single edit covering the whole changed span, and the over-rewrite
  // warning will fire downstream) but verbatim-correct, and never an OOM.
  if (n === 0 || m === 0 || n * m > MAX_LCS_CELLS) {
    ranges.push({ op: "replace", aStart: lo, aEnd: aHi, bStart: lo, bEnd: bHi });
    return;
  }

  // lcs[i*(m+1)+j] = length of the LCS of middle a[i:] and middle b[j:].
  // Flat and typed: row-per-row JS arrays cost several times this and are
  // exactly what made the old table exhaust the isolate.
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    const row = i * width;
    const below = row + width;
    for (let j = m - 1; j >= 0; j--) {
      lcs[row + j] =
        a[lo + i] === b[lo + j]
          ? lcs[below + j + 1] + 1
          : Math.max(lcs[below + j], lcs[row + j + 1]);
    }
  }

  type RawOp = "equal" | "insert" | "delete";
  const raw: Array<{ op: RawOp; ai: number; bi: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[lo + i] === b[lo + j]) {
      raw.push({ op: "equal", ai: lo + i, bi: lo + j });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      raw.push({ op: "delete", ai: lo + i, bi: lo + j });
      i++;
    } else {
      raw.push({ op: "insert", ai: lo + i, bi: lo + j });
      j++;
    }
  }
  while (i < n) raw.push({ op: "delete", ai: lo + i++, bi: lo + j });
  while (j < m) raw.push({ op: "insert", ai: lo + i, bi: lo + j++ });

  for (const step of raw) {
    const last = ranges[ranges.length - 1];
    const isEqual = step.op === "equal";
    // The prefix equal range never joins a middle run: the first middle step
    // is non-equal by construction, and equal only merges with equal.
    const sameRun = last !== undefined && (isEqual ? last.op === "equal" : last.op !== "equal");

    if (sameRun) {
      // Equal-run-extension shares this update with replace-run-extension:
      // an insert step never touches `a`, a delete step never touches `b`.
      last.aEnd = step.op === "insert" ? last.aEnd : step.ai + 1;
      last.bEnd = step.op === "delete" ? last.bEnd : step.bi + 1;
      continue;
    }

    ranges.push(
      isEqual
        ? { op: "equal", aStart: step.ai, aEnd: step.ai + 1, bStart: step.bi, bEnd: step.bi + 1 }
        : step.op === "delete"
          ? { op: "replace", aStart: step.ai, aEnd: step.ai + 1, bStart: step.bi, bEnd: step.bi }
          : { op: "replace", aStart: step.ai, aEnd: step.ai, bStart: step.bi, bEnd: step.bi + 1 }
    );
  }
}

export interface WordEdit {
  sentIdx: number;
  /** Empty for a pure insertion — nothing was there. */
  original: string;
  /** Empty for a pure deletion. */
  corrected: string;
}

/**
 * Diffs each sentence against its corrected counterpart and returns every
 * changed span. Defensive about a length mismatch between the two arrays
 * (the caller validates this is never the happy path) rather than reading
 * past the shorter one.
 */
export function extractEdits(sentences: string[], corrected: string[]): WordEdit[] {
  const edits: WordEdit[] = [];
  const len = Math.min(sentences.length, corrected.length);
  for (let sentIdx = 0; sentIdx < len; sentIdx++) {
    const aSource = sentences[sentIdx]!;
    const bSource = corrected[sentIdx]!;
    const aTokens = tokenizeWithOffsets(aSource);
    const bTokens = tokenizeWithOffsets(bSource);
    for (const r of diffWords(
      aTokens.map((t) => t.text),
      bTokens.map((t) => t.text)
    )) {
      if (r.op === "equal") continue;
      edits.push({
        sentIdx,
        original: sliceTokens(aSource, aTokens, r.aStart, r.aEnd),
        corrected: sliceTokens(bSource, bTokens, r.bStart, r.bEnd),
      });
    }
  }
  return edits;
}

/**
 * Guards against the corrector rewriting instead of correcting: the fraction
 * of the original word count that a set of edits touched. Only `original`
 * counts, so a pure insertion (empty `original`) contributes nothing — an
 * entry with several missing articles is not "half rewritten".
 */
export const MAX_REWRITE_RATIO = 0.45;

export function rewriteRatio(sentences: string[], edits: WordEdit[]): number {
  const totalWords = sentences.reduce((n, s) => n + tokenize(s).length, 0);
  if (totalWords === 0) return 0;
  const changedWords = edits.reduce((n, e) => n + tokenize(e.original).length, 0);
  return changedWords / totalWords;
}

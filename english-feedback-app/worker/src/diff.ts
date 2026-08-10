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

function tokenize(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean);
}

/**
 * Diffs two token arrays. A run of consecutive non-matching tokens — deletes,
 * inserts, or a mix of both — becomes a single "replace" range rather than
 * adjacent delete/insert ranges, so a substitution reads as one edit.
 * `aStart === aEnd` means a pure insertion; `bStart === bEnd` means a pure
 * deletion.
 */
export function diffWords(a: string[], b: string[]): DiffRange[] {
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  type RawOp = "equal" | "insert" | "delete";
  const raw: Array<{ op: RawOp; ai: number; bi: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ op: "equal", ai: i, bi: j });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      raw.push({ op: "delete", ai: i, bi: j });
      i++;
    } else {
      raw.push({ op: "insert", ai: i, bi: j });
      j++;
    }
  }
  while (i < n) raw.push({ op: "delete", ai: i++, bi: j });
  while (j < m) raw.push({ op: "insert", ai: i, bi: j++ });

  const ranges: DiffRange[] = [];
  for (const step of raw) {
    const last = ranges[ranges.length - 1];
    const isEqual = step.op === "equal";
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

  return ranges;
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
    const a = tokenize(sentences[sentIdx]);
    const b = tokenize(corrected[sentIdx]);
    for (const r of diffWords(a, b)) {
      if (r.op === "equal") continue;
      edits.push({
        sentIdx,
        original: a.slice(r.aStart, r.aEnd).join(" "),
        corrected: b.slice(r.bStart, r.bEnd).join(" "),
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

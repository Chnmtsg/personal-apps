export interface Segment {
  text: string;
  highlighted: boolean;
}

/**
 * A span always covers whole words, because every span originates as a run of
 * whitespace-delimited tokens from `worker/src/diff.ts`. Matching it as a bare
 * substring marks the wrong letters: the article "a" lands inside "make", and
 * the pronoun "he" inside "The" — and short spans like those are exactly this
 * learner's most frequent corrections.
 */
function indexOfWholeWord(text: string, span: string, from: number): number {
  for (let at = text.indexOf(span, from); at !== -1; at = text.indexOf(span, at + 1)) {
    const startsWord = at === 0 || /\s/.test(text[at - 1]!);
    const end = at + span.length;
    const endsWord = end === text.length || /\s/.test(text[end]!);
    if (startsWord && endsWord) return at;
  }
  return -1;
}

/**
 * Split `text` into segments, marking each span in `spans`. Overlapping
 * matches are merged. Used to mark changed segments in the corrected text
 * (§5.2) and erroneous spans in the original.
 *
 * Spans are matched left to right, each consuming its own occurrence. Matching
 * every span from position 0 instead would make a common correction — "the",
 * "a", "is" — highlight the first occurrence in the whole entry rather than
 * the word that actually changed.
 */
export function buildSegments(text: string, spans: string[]): Segment[] {
  const ranges: Array<[number, number]> = [];
  let cursor = 0;

  for (const span of spans) {
    if (!span) continue;
    const forward = indexOfWholeWord(text, span, cursor);
    if (forward !== -1) {
      ranges.push([forward, forward + span.length]);
      cursor = forward + span.length;
      continue;
    }
    // Corrections are not guaranteed to arrive in document order, so a span
    // that isn't ahead of the cursor may still be present behind it.
    const anywhere = indexOfWholeWord(text, span, 0);
    if (anywhere !== -1) ranges.push([anywhere, anywhere + span.length]);
  }

  ranges.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }

  const segments: Segment[] = [];
  let pos = 0;
  for (const [start, end] of merged) {
    if (start > pos) segments.push({ text: text.slice(pos, start), highlighted: false });
    segments.push({ text: text.slice(start, end), highlighted: true });
    pos = end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlighted: false });
  return segments;
}

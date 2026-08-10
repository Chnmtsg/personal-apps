export interface Segment {
  text: string;
  highlighted: boolean;
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
    const forward = text.indexOf(span, cursor);
    if (forward !== -1) {
      ranges.push([forward, forward + span.length]);
      cursor = forward + span.length;
      continue;
    }
    // Corrections are not guaranteed to arrive in document order, so a span
    // that isn't ahead of the cursor may still be present behind it.
    const anywhere = text.indexOf(span);
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

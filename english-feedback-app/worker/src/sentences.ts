/**
 * Splits text into sentences on `.`, `!`, or `?` followed by whitespace.
 *
 * Deliberately simple. Abbreviations ("e.g.", "Mr.") over-split — that only
 * shifts which sentence an edit is attributed to, never whether the edit
 * itself is correct, since `diff.ts` re-diffs each sentence pair
 * independently of how the boundary fell.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Rebuilds full text by replacing each sentence with its corrected version,
 * leaving everything between sentences — paragraph breaks, extra whitespace —
 * exactly as the writer typed it. The corrector only ever sees one sentence
 * at a time, so this is what keeps a multi-paragraph entry from collapsing
 * into one line when its sentences are rejoined.
 *
 * Matches left to right with a cursor, the same approach as
 * `app/src/lib/highlight.ts`'s `buildSegments`, so a sentence that repeats
 * verbatim still lands on its own occurrence rather than the first one.
 */
export function reconstructText(original: string, sentences: string[], corrected: string[]): string {
  let result = "";
  let cursor = 0;
  const len = Math.min(sentences.length, corrected.length);
  for (let i = 0; i < len; i++) {
    const sentence = sentences[i];
    if (!sentence) continue;
    const at = original.indexOf(sentence, cursor);
    // Shouldn't happen — `sentences` was produced by splitting this same
    // `original` — but skip rather than corrupt the rebuild if it ever does.
    if (at === -1) continue;
    result += original.slice(cursor, at) + corrected[i];
    cursor = at + sentence.length;
  }
  return result + original.slice(cursor);
}

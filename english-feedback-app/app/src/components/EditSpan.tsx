/**
 * Renders a before/after pair. A diff-derived edit can have an empty
 * `original` (a pure insertion — nothing was there) or an empty `corrected`
 * (a pure deletion), so a plain "original → corrected" would show an empty
 * strikethrough or an arrow to nothing.
 *
 * `del`/`ins` rather than styled spans, plus an sr-only word for each case:
 * a strikethrough is not announced by VoiceOver or TalkBack and "→" is read
 * inconsistently, so without them the pair reaches a screen reader as two
 * bare phrases with nothing to say which is the mistake and which is the fix.
 * This component is the atom of both the corrections list and every Error Log
 * example.
 *
 * `tone="improvement"` is for pairs that are not errors — a fluency note is a
 * "this would sound more natural" suggestion, not a mistake, so the removed
 * half reads in a neutral ink rather than the warning colour reserved for
 * actual errors. The sr-only wording changes to match.
 */
export default function EditSpan({
  original,
  corrected,
  tone = "error",
}: {
  original: string;
  corrected: string;
  tone?: "error" | "improvement";
}) {
  const delClass =
    tone === "improvement" ? "text-ink-ghost decoration-ink-ghost/50" : "text-warn decoration-warn/50";
  const removedWord = tone === "improvement" ? "before: " : "removed: ";
  const changedWord = tone === "improvement" ? "more natural: " : "changed to: ";
  if (!original) {
    return (
      <ins className="font-medium text-accent no-underline">
        <span className="sr-only">added: </span>+ {corrected}
      </ins>
    );
  }
  if (!corrected) {
    return (
      <del className={delClass}>
        <span className="sr-only">{removedWord}</span>
        {original}
      </del>
    );
  }
  return (
    <>
      <del className={delClass}>{original}</del>{" "}
      <ins className="font-medium text-accent no-underline">
        <span className="sr-only">{changedWord}</span>→ {corrected}
      </ins>
    </>
  );
}

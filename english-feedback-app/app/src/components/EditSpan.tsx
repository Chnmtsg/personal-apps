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
 */
export default function EditSpan({ original, corrected }: { original: string; corrected: string }) {
  if (!original) {
    return (
      <ins className="font-medium text-accent no-underline">
        <span className="sr-only">added: </span>+ {corrected}
      </ins>
    );
  }
  if (!corrected) {
    return (
      <del className="text-warn decoration-warn/50">
        <span className="sr-only">removed: </span>
        {original}
      </del>
    );
  }
  return (
    <>
      <del className="text-warn decoration-warn/50">{original}</del>{" "}
      <ins className="font-medium text-accent no-underline">
        <span className="sr-only">changed to: </span>→ {corrected}
      </ins>
    </>
  );
}

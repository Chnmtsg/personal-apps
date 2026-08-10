/**
 * Renders a before/after pair. A diff-derived edit can have an empty
 * `original` (a pure insertion — nothing was there) or an empty `corrected`
 * (a pure deletion), so a plain "original → corrected" would show an empty
 * strikethrough or an arrow to nothing.
 */
export default function EditSpan({ original, corrected }: { original: string; corrected: string }) {
  if (!original) {
    return <span className="font-medium text-emerald-700">+ {corrected}</span>;
  }
  if (!corrected) {
    return <span className="text-red-600 line-through">{original}</span>;
  }
  return (
    <>
      <span className="text-red-600 line-through">{original}</span>{" "}
      <span className="font-medium text-emerald-700">→ {corrected}</span>
    </>
  );
}

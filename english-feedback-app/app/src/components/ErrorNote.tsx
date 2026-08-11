/** Shown when a screen's data could not be loaded from local storage. */
export default function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-2xl border border-warn/25 bg-warn-soft p-4 text-sm text-warn"
    >
      {message}
    </p>
  );
}

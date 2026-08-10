/** Shown when a screen's data could not be loaded from local storage. */
export default function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      {message}
    </p>
  );
}

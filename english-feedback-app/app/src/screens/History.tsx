import type { Screen } from "../App";
import ErrorNote from "../components/ErrorNote";
import { FAIL_REASON_LABELS } from "../lib/categories";
import { getEntries, type Entry } from "../lib/db";
import { useLoad } from "../lib/useLoad";

interface Props {
  navigate: (s: Screen) => void;
}

function badgeFor(entry: Entry): { label: string; cls: string } | null {
  if (entry.status === "queued") {
    return { label: "Waiting for connection", cls: "bg-amber-100 text-amber-900" };
  }
  if (entry.status === "failed") {
    return {
      label: FAIL_REASON_LABELS[entry.failReason ?? "server"] ?? "Couldn't analyse",
      cls: "bg-red-100 text-red-800",
    };
  }
  return null;
}

export default function HistoryScreen({ navigate }: Props) {
  const state = useLoad(() => getEntries(), []);

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">History</h1>
        <ErrorNote message={state.message} />
      </div>
    );
  }

  const entries = state.data;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">History</h1>
      {entries.length === 0 ? (
        <p className="text-slate-600">No entries yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const badge = badgeFor(entry);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => navigate({ name: "feedback", entryId: entry.id })}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    <span className="font-normal text-slate-500">
                      {new Date(entry.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  {badge ? (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  ) : (
                    entry.feedback && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {entry.feedback.corrections.length}{" "}
                        {entry.feedback.corrections.length === 1 ? "error" : "errors"}
                      </span>
                    )
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{entry.text}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.wordCount} words</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

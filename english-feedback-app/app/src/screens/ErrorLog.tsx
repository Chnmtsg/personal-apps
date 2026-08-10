import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ErrorCategory } from "../../../shared/schema";
import ErrorNote from "../components/ErrorNote";
import EditSpan from "../components/EditSpan";
import {
  getEntries,
  getErrorCounts,
  getExamples,
  getPatternExplanations,
  getTrend,
  type CategoryExample,
} from "../lib/db";
import { CATEGORY_LABELS } from "../lib/categories";
import { useLoad } from "../lib/useLoad";

export default function ErrorLogScreen() {
  const state = useLoad(() => getEntries(), []);
  const [selected, setSelected] = useState<ErrorCategory | null>(null);

  const entries = state.status === "ready" ? state.data : [];

  // Every one of these walks all corrections in every entry. Recomputing them
  // on each render is wasted work that grows with the user's history.
  const counts = useMemo(
    () => [...getErrorCounts(entries).entries()].sort((a, b) => b[1] - a[1]),
    [entries]
  );
  const explanations = useMemo(() => getPatternExplanations(entries), [entries]);
  const trend = useMemo(() => getTrend(entries), [entries]);
  const examples: CategoryExample[] = useMemo(
    () => (selected ? getExamples(entries, selected) : []),
    [entries, selected]
  );

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Error log</h1>
        <ErrorNote message={state.message} />
      </div>
    );
  }

  const maxCount = counts.length > 0 ? counts[0][1] : 0;

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="min-h-11 rounded-full bg-slate-200 px-4 text-sm font-medium"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold">{CATEGORY_LABELS[selected]}</h1>
        </header>
        <p className="text-sm text-slate-600">
          Every past example of this error ({examples.length}).
        </p>
        <div className="flex flex-col gap-3">
          {examples.map((ex, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p>
                <EditSpan original={ex.original} corrected={ex.corrected} />
              </p>
              <p className="mt-1 text-sm text-slate-600">{ex.rule}</p>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(ex.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Error log</h1>

      {counts.length === 0 ? (
        <p className="text-slate-600">
          No analysed entries yet. Write something and tap Analyse — your error patterns will
          build up here.
        </p>
      ) : (
        <>
          {/* Top 3 patterns */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              Your top patterns
            </h2>
            <div className="flex flex-col gap-3">
              {counts.slice(0, 3).map(([cat, count], i) => (
                <div key={cat} className="flex gap-3">
                  <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-blue-700 text-center text-sm font-bold leading-6 text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">
                      {CATEGORY_LABELS[cat]} — {count} {count === 1 ? "error" : "errors"}
                    </p>
                    {explanations.get(cat) && (
                      <p className="text-sm text-slate-600">{explanations.get(cat)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Trend: errors per 100 words */}
          {trend.length >= 2 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                Errors per 100 words
              </h2>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="errorsPer100Words"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                This is the number that should fall over time — raw error counts rise as your
                entries get longer.
              </p>
            </section>
          )}

          {/* All-time totals by category */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              All-time totals
            </h2>
            <div className="flex flex-col gap-1">
              {counts.map(([cat, count]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelected(cat)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-left active:bg-slate-50"
                >
                  <span className="w-40 shrink-0 truncate text-sm">{CATEGORY_LABELS[cat]}</span>
                  <span
                    aria-hidden
                    className="h-3 rounded-full bg-blue-600"
                    style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }}
                  />
                  <span className="ml-1 text-sm font-semibold text-slate-700">{count}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Tap a category to see every example.</p>
          </section>
        </>
      )}
    </div>
  );
}

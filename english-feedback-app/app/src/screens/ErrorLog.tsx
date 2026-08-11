import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ErrorCategory } from "../../../shared/schema";
import ErrorNote from "../components/ErrorNote";
import EditSpan from "../components/EditSpan";
import {
  getEntries,
  getErrorCounts,
  getExamples,
  getPatternMap,
  getTrend,
  formatErrorLog,
  type CategoryExample,
} from "../lib/db";
import { CATEGORY_LABELS } from "../lib/categories";
import { useLoad } from "../lib/useLoad";

export default function ErrorLogScreen({ showToast }: { showToast: (msg: string) => void }) {
  const state = useLoad(() => getEntries(), []);
  const [selected, setSelected] = useState<ErrorCategory | null>(null);

  const entries = state.status === "ready" ? state.data : [];

  const copyLog = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorLog(entries));
      showToast("Copied. Paste it into your chat assistant.");
    } catch (err) {
      console.error("Couldn't copy the error log:", err);
      showToast("This browser would not let us copy it.");
    }
  };

  // Every one of these walks all corrections in every entry. Recomputing them
  // on each render is wasted work that grows with the user's history.
  const counts = useMemo(
    () => [...getErrorCounts(entries).entries()].sort((a, b) => b[1] - a[1]),
    [entries]
  );
  const trend = useMemo(() => getTrend(entries), [entries]);
  const patternMap = useMemo(() => getPatternMap(entries), [entries]);
  const examples: CategoryExample[] = useMemo(
    () => (selected ? getExamples(entries, selected) : []),
    [entries, selected]
  );
  // The most recent rule the learner was given for their top pattern.
  const topRule = useMemo(
    () => (counts.length > 0 ? getExamples(entries, counts[0][0])[0]?.rule : undefined),
    [entries, counts]
  );

  const total = useMemo(() => counts.reduce((sum, [, n]) => sum + n, 0), [counts]);
  const analysed = useMemo(() => entries.filter((e) => e.feedback).length, [entries]);
  const seenPatterns = useMemo(
    () => patternMap.filter((p) => p.status !== "unseen"),
    [patternMap]
  );

  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-3xl">Patterns</h1>
        <ErrorNote message={state.message} />
      </div>
    );
  }

  /* ---------------------------------------------------------------------
     One category, every example the learner has ever written. Reading them
     in one place is how a habit becomes visible.
  --------------------------------------------------------------------- */
  if (selected) {
    return (
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="min-h-11 self-start text-sm text-ink-soft"
        >
          ‹ Patterns
        </button>
        <h1 className="mt-2 font-serif text-[28px] leading-tight">{CATEGORY_LABELS[selected]}</h1>
        <dl className="mt-3.5 flex gap-6 border-b border-rule pb-4">
          <div>
            <dd className="tnum font-mono text-[22px] leading-none">{examples.length}</dd>
            <dt className="eyebrow mt-1.5">All time</dt>
          </div>
          <div>
            <dd className="tnum font-mono text-[22px] leading-none">
              {total === 0 ? "—" : `${Math.round((examples.length / total) * 100)}%`}
            </dd>
            <dt className="eyebrow mt-1.5">Of everything</dt>
          </div>
        </dl>
        <ul className="flex flex-col">
          {examples.map((ex, i) => (
            <li key={i} className="border-b border-rule py-4">
              <p className="font-serif text-[17px] leading-[1.5]">
                <EditSpan original={ex.original} corrected={ex.corrected} />
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{ex.rule}</p>
              <p className="eyebrow mt-1.5">
                {new Date(ex.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <header>
        <h1 className="font-serif text-3xl leading-none">Patterns</h1>
        <p className="eyebrow mt-1.5">
          {total} corrections · {analysed} {analysed === 1 ? "entry" : "entries"}
        </p>
      </header>

      {counts.length === 0 ? (
        <p className="mt-6 font-serif text-[17px] leading-relaxed text-ink-soft text-pretty">
          Nothing checked yet. Write something and tap Analyse — after twenty or thirty entries
          this screen can tell you which mistake is actually yours, not the one you made today.
        </p>
      ) : (
        <>
          {/* The one sentence this whole app exists to deliver, so it is the
              biggest thing on the screen and carries the app's only filled
              block of colour. */}
          <section className="mt-5 rounded-[18px] bg-accent p-5 text-[#eceaf6]">
            <h2>
              <span className="eyebrow block text-[#eceaf6]/75">Your number one pattern</span>
              <span className="mt-2 block font-serif text-[27px] leading-[1.15] text-white">
                {CATEGORY_LABELS[counts[0][0]]}
              </span>
            </h2>
            <p className="mt-2.5 flex items-baseline gap-2">
              <span className="tnum font-mono text-[34px] font-medium leading-none text-white">
                {counts[0][1]}
              </span>
              <span className="text-[13px] opacity-80">
                {counts[0][1] === 1 ? "error" : "errors"} so far
                {total > 0 && ` · ${Math.round((counts[0][1] / total) * 100)}% of everything`}
              </span>
            </p>
            {topRule && (
              <p className="mt-3 text-[14px] leading-relaxed opacity-90 text-pretty">{topRule}</p>
            )}
          </section>

          {/* The top-100 checklist as a map: finite, visible, with an end the
              learner can see. A streak measures attendance; this measures
              which known traps still catch them. */}
          {seenPatterns.length > 0 && (
            <section className="mt-4 rounded-2xl border border-rule bg-card p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="eyebrow">Your top-100 map</h2>
                <span className="tnum font-mono text-[13px] font-medium text-ink">
                  {seenPatterns.length} seen
                </span>
              </div>
              <div className="mt-3 grid grid-cols-12 gap-1" aria-hidden>
                {patternMap.map((p) => (
                  <span
                    key={p.id}
                    title={`#${p.id}: “${p.wrong}” → “${p.right}”`}
                    className={`aspect-square rounded-[3px] ${
                      p.status === "active"
                        ? "bg-warn/70"
                        : p.status === "fading"
                          ? "bg-accent/40"
                          : "bg-ink/[0.07]"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-warn/70" /> still happening
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-accent/40" /> going quiet
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-ink/[0.07]" /> not seen yet
                </span>
              </p>
            </section>
          )}

          {/* Trend: errors per 100 words */}
          {trend.length >= 2 && (
            <section className="mt-4 rounded-2xl border border-rule bg-card p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="eyebrow">Errors per 100 words</h2>
                <span className="tnum font-mono text-[13px] font-medium text-accent">
                  {trend[trend.length - 1].errorsPer100Words.toFixed(1)}
                </span>
              </div>
              <div className="mt-3 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#a09a8c", fontFamily: "IBM Plex Mono" }}
                      stroke="rgba(28,26,23,0.15)"
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#a09a8c", fontFamily: "IBM Plex Mono" }}
                      stroke="rgba(28,26,23,0.15)"
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid rgba(28,26,23,0.12)",
                        background: "#fffdf8",
                        fontFamily: "IBM Plex Sans",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="errorsPer100Words"
                      stroke="#33418f"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: "#33418f", strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">
                This should get smaller over time. It does not go up just because you write more.
              </p>
            </section>
          )}

          {/* Every error so far, ranked. */}
          <section className="mt-6">
            <div className="flex items-baseline justify-between border-b border-rule pb-2.5">
              <h2 className="eyebrow">Every error so far</h2>
              <span className="eyebrow">N · share</span>
            </div>
            <ol>
              {counts.map(([cat, count], n) => (
                <li key={cat}>
                  <button
                    type="button"
                    onClick={() => setSelected(cat)}
                    className={`flex min-h-14 w-full items-center gap-3 border-b border-rule px-1 text-left ${
                      n === 0 ? "bg-accent-soft/60" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`tnum w-4 font-mono text-[10px] ${
                        n === 0 ? "text-accent" : "text-ink-ghost"
                      }`}
                    >
                      {String(n + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 py-2 font-serif text-[15px] leading-snug">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="tnum font-mono text-[13px] font-medium">{count}</span>
                    <span
                      className={`tnum w-10 text-right font-mono text-[12px] ${
                        n === 0 ? "text-accent" : "text-ink-soft"
                      }`}
                    >
                      {total === 0 ? "—" : `${Math.round((count / total) * 100)}%`}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-2.5 text-[12px] text-ink-faint">
              Tap a type to read every example you have written.
            </p>
            <button
              type="button"
              onClick={() => void copyLog()}
              className="mt-4 min-h-11 w-full rounded-full border border-rule-strong text-sm font-medium text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Copy my error log
            </button>
            <p className="mt-1.5 text-center text-[12px] text-ink-faint">
              Paste it into a chat assistant so it knows your patterns.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

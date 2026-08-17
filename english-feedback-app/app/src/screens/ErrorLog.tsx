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
  getAnalysedCount,
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

// No virtualisation library (chief-architect: off limits for a list-length
// problem a slice solves) — a plain cap with an appending "show more" keeps
// the DOM small for a category with a long history without a dependency.
const PAGE_SIZE = 50;

export default function ErrorLogScreen({ showToast }: { showToast: (msg: string) => void }) {
  const state = useLoad(() => getEntries(), []);
  const [selected, setSelected] = useState<ErrorCategory | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset the page size whenever a different category is opened, so a long
  // list left expanded for one category doesn't carry over to the next.
  const selectCategory = (cat: ErrorCategory | null) => {
    setSelected(cat);
    setVisibleCount(PAGE_SIZE);
  };

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
  // getAnalysedCount is the one definition of "analysed" every statistic on
  // this screen already counts by (status === "analysed" && feedback); the
  // former entries.filter((e) => e.feedback).length here checked feedback
  // alone and could disagree with the counts and trend beside it.
  const analysed = useMemo(() => getAnalysedCount(entries), [entries]);
  const seenPatterns = useMemo(
    () => patternMap.filter((p) => p.status !== "unseen"),
    [patternMap]
  );
  const activeCount = useMemo(
    () => patternMap.filter((p) => p.status === "active").length,
    [patternMap]
  );
  const fadingCount = useMemo(
    () => patternMap.filter((p) => p.status === "fading").length,
    [patternMap]
  );

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-3xl">Patterns</h1>
        <p role="status" className="text-sm text-ink-soft">
          Loading your patterns…
        </p>
      </div>
    );
  }
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
          onClick={() => selectCategory(null)}
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
          {/* getExamples already sorts newest-first, so a slice is the right
              examples (WORK-14) — no virtualisation library for a list-length
              problem a slice solves. */}
          {examples.slice(0, visibleCount).map((ex, i) => (
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
        {examples.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="mt-2 min-h-11 w-full rounded-full border border-rule-strong text-sm font-medium text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Show {Math.min(PAGE_SIZE, examples.length - visibleCount)} more
          </button>
        )}
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
          <section className="mt-5 rounded-[18px] bg-accent p-5 text-white">
            <h2>
              {/* `!` forces this above .eyebrow's own text-ink-faint: both
                  land in the same Tailwind layer, so without it the later
                  .eyebrow rule would win and this would render unreadably
                  dark on the accent background. */}
              <span className="eyebrow block text-white/75!">Your number one pattern, all time</span>
              <span className="mt-2 block font-serif text-[27px] leading-[1.15] text-white">
                {CATEGORY_LABELS[counts[0][0]]}
              </span>
            </h2>
            <p className="mt-2.5 flex items-baseline gap-2">
              <span className="tnum font-mono text-[34px] font-medium leading-none text-white">
                {counts[0][1]}
              </span>
              <span className="text-[13px] opacity-80">
                {counts[0][1] === 1 ? "error" : "errors"} since you started
                {total > 0 && ` · ${Math.round((counts[0][1] / total) * 100)}% of everything`}
              </span>
            </p>
            {topRule && (
              <p className="mt-3 text-[14px] leading-relaxed opacity-90 text-pretty">{topRule}</p>
            )}
          </section>

          {/* The traps the app can catch automatically, as a map: finite,
              visible, with an end the learner can see. A streak measures
              attendance; this measures which known traps still catch them.
              Deliberately NOT the full Top-100 checklist (WORK-11 / ruling
              C2): `pattern_id` is only ever written by the deterministic
              matcher, so a 96- or 100-cell grid would show a denominator
              the code can never fill in — 47+ cells permanently grey under
              a header that calls them "not seen yet" when they are in fact
              unreachable. The three states are told apart by shape, not
              only colour, and the sentence below carries the grid's full
              information content in words for anyone who cannot see it. */}
          {seenPatterns.length > 0 && (
            <section className="mt-4 rounded-2xl border border-rule bg-card p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="eyebrow">Traps we catch automatically</h2>
                <span className="tnum font-mono text-[13px] font-medium text-ink">
                  {seenPatterns.length} of {patternMap.length}
                </span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                {seenPatterns.length} of {patternMap.length} traps seen; {activeCount}{" "}
                still happening, {fadingCount} going quiet.
              </p>
              <div className="mt-3 grid grid-cols-12 gap-1">
                {patternMap.map((p) => (
                  <span
                    key={p.id}
                    title={`#${p.id}: “${p.wrong}” → “${p.right}”`}
                    className={`aspect-square rounded-[3px] ${
                      p.status === "active"
                        ? "bg-warn/70"
                        : p.status === "fading"
                          ? "border-2 border-accent/60 bg-accent/10"
                          : "border border-dashed border-rule bg-transparent"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px] bg-warn/70" /> still happening
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px] border-2 border-accent/60 bg-accent/10"
                  />{" "}
                  going quiet
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px] border border-dashed border-rule bg-transparent"
                  />{" "}
                  not seen yet
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
                {/* Recharts styles its own SVG children with inline props, not
                    Tailwind classes, so these literal hexes cannot be token
                    utilities — they are hand-mirrored from ink-ghost, rule,
                    accent and card in app/src/index.css. Keep them in sync by
                    hand if those values ever move. */}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#767061", fontFamily: "IBM Plex Mono" }}
                      stroke="rgba(28,26,23,0.15)"
                      tickFormatter={(d: string) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#767061", fontFamily: "IBM Plex Mono" }}
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
              <span className="eyebrow">Count · % of all</span>
            </div>
            <ol>
              {counts.map(([cat, count], n) => (
                <li key={cat}>
                  <button
                    type="button"
                    onClick={() => selectCategory(cat)}
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

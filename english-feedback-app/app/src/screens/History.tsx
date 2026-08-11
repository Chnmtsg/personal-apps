import { useState } from "react";
import type { Screen } from "../App";
import ErrorNote from "../components/ErrorNote";
import { FAIL_REASON_LABELS } from "../lib/categories";
import { getEntries, per100, topCategories, type Entry } from "../lib/db";
import { useLoad } from "../lib/useLoad";
import { MIN_WORDS } from "../../../shared/schema.ts";

// No virtualisation library (chief-architect: off limits for a list-length
// problem a slice solves) — a plain cap with an appending "show more" keeps
// the DOM small on a long history without adding a dependency.
const PAGE_SIZE = 50;

interface Props {
  navigate: (s: Screen) => void;
}

function badgeFor(entry: Entry): { label: string; cls: string } | null {
  if (entry.status === "analysing") {
    return { label: "Checking now", cls: "border-accent/35 text-accent" };
  }
  if (entry.status === "queued") {
    // Not always the connection: a busy server and a rate limit both land
    // here too, and telling the learner to check their wifi is a wrong answer.
    return { label: "Waiting", cls: "border-rule-strong text-ink-soft" };
  }
  if (entry.status === "failed") {
    return {
      label: FAIL_REASON_LABELS[entry.failReason ?? "server"],
      cls: "border-warn/35 text-warn",
    };
  }
  return null;
}

export default function HistoryScreen({ navigate }: Props) {
  const state = useLoad(() => getEntries(), []);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-3xl">History</h1>
        <p role="status" className="text-sm text-ink-soft">
          Loading your entries…
        </p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-3xl">History</h1>
        <ErrorNote message={state.message} />
      </div>
    );
  }

  const entries = state.data;
  const words = entries.reduce((sum, e) => sum + e.wordCount, 0);
  // getEntries() is already newest-first, so a slice is the right entries.
  const visible = entries.slice(0, visibleCount);

  return (
    <div className="flex flex-col">
      <header>
        <h1 className="font-serif text-3xl leading-none">History</h1>
        <p className="eyebrow mt-1.5">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
          {words.toLocaleString()} words
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="mt-6 font-serif text-[17px] leading-relaxed text-ink-soft text-pretty">
          Nothing here yet. Tap <strong className="font-semibold text-ink">Write</strong> to add
          your first piece of writing — {MIN_WORDS} words is enough.
        </p>
      ) : (
        <>
          {/* A column head, because the rows are a table: the learner is meant
              to read the last column down the page, not row by row. */}
          <div className="mt-5 flex border-b border-rule pb-2.5">
            <span className="eyebrow w-14">Date</span>
            <span className="eyebrow flex-1">First line</span>
            <span className="eyebrow w-10 text-right">Words</span>
            <span className="eyebrow w-16 text-right">Per 100 words</span>
          </div>
          <ol>
            {visible.map((entry) => {
              const badge = badgeFor(entry);
              const rate = per100(entry);
              const cats = topCategories(entry);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ name: "feedback", entryId: entry.id })}
                    className="flex w-full items-start border-b border-rule py-3.5 text-left active:bg-ink/[0.02]"
                  >
                    <span className="tnum w-14 pt-0.5 font-mono text-[11.5px] font-medium uppercase text-ink">
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <span className="flex-1 pr-2">
                      <span className="line-clamp-2 block font-serif text-[14.5px] leading-[1.45] text-ink">
                        {entry.text}
                      </span>
                      {badge ? (
                        <span
                          className={`mt-1.5 inline-block border px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      ) : (
                        cats && (
                          <span className="eyebrow mt-1.5 block">
                            {cats}
                            {entry.feedback?.cefr_estimate
                              ? ` · ${entry.feedback.cefr_estimate}`
                              : ""}
                          </span>
                        )
                      )}
                    </span>
                    <span className="tnum w-10 pt-0.5 text-right font-mono text-[12px] text-ink">
                      {entry.wordCount}
                    </span>
                    <span
                      className={`tnum w-16 pt-0.5 text-right font-mono text-[12px] ${
                        rate === null ? "text-ink-ghost" : "font-medium text-ink"
                      }`}
                    >
                      {rate === null ? "—" : rate.toFixed(1)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {entries.length > visible.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="mt-4 min-h-11 w-full rounded-full border border-rule-strong text-sm font-medium text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Show {Math.min(PAGE_SIZE, entries.length - visible.length)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

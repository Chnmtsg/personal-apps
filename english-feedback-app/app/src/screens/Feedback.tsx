import { useMemo, useState } from "react";
import type { Screen } from "../App";
import ErrorNote from "../components/ErrorNote";
import EditSpan from "../components/EditSpan";
import {
  getCategoryHistory,
  getEntries,
  getEntry,
  getQuietCategories,
  ordinal,
  per100,
  previousRate,
  requeueFailedEntry,
  type CategoryHistoryForEntry,
  type Entry,
} from "../lib/db";
import { processQueue } from "../lib/queue";
import { canRequeue } from "../lib/claim";
import { FAIL_REASON_MESSAGES, labelFor, normalizeCategory } from "../lib/categories";
import { buildSegments } from "../lib/highlight";
import { explanationRows, hasLegacyAppendix } from "../lib/feedbackSections";
import { useLoad } from "../lib/useLoad";
import type { ErrorCategory } from "../../../shared/schema";

interface Props {
  entryId: string;
  navigate: (s: Screen) => void;
  showToast: (msg: string) => void;
}

/** What to say about an entry that has no feedback yet, at A2+/B1. */
function pendingMessage(entry: Entry): string {
  if (entry.status === "analysing") {
    return "We are checking your writing now. This takes a few minutes.";
  }
  if (entry.status === "queued") {
    return "This writing is waiting to be checked. We will do it soon.";
  }
  return `${FAIL_REASON_MESSAGES[entry.failReason ?? "server"]} Your writing is safe below.`;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow block">{children}</span>;
}

export default function FeedbackScreen({ entryId, navigate, showToast }: Props) {
  const state = useLoad(() => getEntry(entryId), [entryId]);
  // Only for the closing card's "your last entry was…" sentence — best-effort,
  // so a failure here degrades to no comparison rather than a broken screen.
  const historyState = useLoad(() => getEntries(), []);

  const tryAgain = async (id: string) => {
    try {
      if (!(await requeueFailedEntry(id))) return;
    } catch (err) {
      console.error("Couldn't put the entry back in the queue:", err);
      showToast("We could not save that on your device. Please try again.");
      return;
    }
    navigate({ name: "history" });
    void processQueue();
  };

  const entry = state.status === "ready" ? state.data : null;
  const fb = entry?.feedback ?? null;
  const priorRate = useMemo(
    () => (entry && historyState.status === "ready" ? previousRate(historyState.data, entry.id) : null),
    [entry, historyState]
  );
  // "You could also say…" phrasings, keyed by the index into fb.corrections
  // they belong to (ADR 0002 Part B). Lives outside `Correction` on purpose —
  // see shared/schema.ts's AlternativeSchema — so this lookup is the only
  // place the two are joined back together, for rendering only.
  // A rule prints on its first appearance only — see explanationRows.
  const showRule = useMemo(() => explanationRows(fb?.corrections ?? []), [fb]);
  const altsByIndex = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const a of fb?.alternatives ?? []) map.set(a.for, a.phrasings);
    return map;
  }, [fb]);
  // Per-correction history (this task): how many times a category has come
  // up, and what the learner wrote last time — computed relative to the
  // entry being viewed, never all-time (see stats.ts). Keyed by the index of
  // that category's FIRST row, same reasoning as showRule: three article
  // corrections should carry the history line once, not three times.
  const categoryHistories = useMemo(() => {
    const map = new Map<number, CategoryHistoryForEntry>();
    if (!entry || !fb || historyState.status !== "ready") return map;
    const seen = new Set<ErrorCategory>();
    fb.corrections.forEach((c, index) => {
      const cat = normalizeCategory(c.category);
      if (seen.has(cat)) return;
      seen.add(cat);
      map.set(index, getCategoryHistory(historyState.data, entry.id, cat));
    });
    return map;
  }, [entry, fb, historyState]);
  // Categories that used to appear and have gone quiet — the honest form of
  // "now it's fixed" (see getQuietCategories). Capped and sorted so the
  // longest-quiet category leads; this is a closing note, not a second list
  // to read in full.
  const quietCategories = useMemo(() => {
    if (!entry || !fb || historyState.status !== "ready") return [];
    return [...getQuietCategories(historyState.data, entry.id)]
      .sort((a, b) => b.entriesSince - a.entriesSince)
      .slice(0, 3);
  }, [entry, fb, historyState]);

  const back = (
    <button
      type="button"
      onClick={() => navigate({ name: "history" })}
      className="min-h-11 text-sm text-ink-soft"
    >
      ‹ History
    </button>
  );

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <header>{back}</header>
        <p role="status" className="text-sm text-ink-soft">
          Loading this entry…
        </p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <header>{back}</header>
        <ErrorNote message={state.message} />
      </div>
    );
  }
  if (!entry) {
    return (
      <div className="flex flex-col gap-4">
        <header>{back}</header>
        <p className="text-ink-soft">Entry not found.</p>
      </div>
    );
  }

  /* ---------------------------------------------------------------------
     No feedback yet. Reassurance first, the attempt count as data, then the
     writing itself — the learner's first question here is whether their
     words are gone.
  --------------------------------------------------------------------- */
  if (!fb) {
    const failed = entry.status === "failed";
    return (
      <div className="flex flex-col gap-4">
        <header>{back}</header>
        <section
          className={`rounded-2xl border p-5 ${
            failed ? "border-warn/25 bg-warn-soft" : "border-rule bg-card"
          }`}
        >
          <Eyebrow>{failed ? "Not checked yet" : "In progress"}</Eyebrow>
          <h1 className="mt-2.5 font-serif text-2xl leading-snug text-ink">
            {failed ? "The server had a problem. Your writing is safe." : "We are on it."}
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-muted">
            {pendingMessage(entry)}
          </p>
          {canRequeue(entry) && (
            <button
              type="button"
              onClick={() => void tryAgain(entry.id)}
              className="mt-4 min-h-11 rounded-full bg-accent px-6 text-sm font-semibold text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Try again
            </button>
          )}
          <dl className="mt-4 flex gap-6 border-t border-rule pt-3.5">
            <div>
              <dd className="tnum font-mono text-[15px] font-medium text-ink">
                {entry.attempts ?? 0}
              </dd>
              <dt className="eyebrow mt-1">Attempts</dt>
            </div>
            <div>
              <dd className="tnum font-mono text-[15px] font-medium text-ink">
                {new Date(entry.createdAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </dd>
              <dt className="eyebrow mt-1">Written</dt>
            </div>
            <div>
              <dd className="tnum font-mono text-[15px] font-medium text-ink">
                {entry.wordCount}
              </dd>
              <dt className="eyebrow mt-1">Words</dt>
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border border-rule bg-card p-5">
          <Eyebrow>Your writing</Eyebrow>
          <p className="mt-3 whitespace-pre-wrap font-serif text-[16.5px] leading-[1.75] text-ink">
            {entry.text}
          </p>
        </section>
      </div>
    );
  }

  /* ---------------------------------------------------------------------
     Acute distress. The app deliberately produced no grammar feedback for
     this entry — a crisis is never turned into a grammar lesson. The coach's
     wellbeing reply, then resources, then their own writing, kept safe.
  --------------------------------------------------------------------- */
  if (fb.risk === "acute") {
    return (
      <div className="flex flex-col gap-4">
        <header>{back}</header>
        <section className="rounded-2xl border border-rule bg-card p-5">
          <Eyebrow>About this entry</Eyebrow>
          <h1 className="mt-2.5 font-serif text-2xl leading-snug text-ink">
            What you wrote sounds heavy.
          </h1>
          {fb.coach_reply && (
            <p className="mt-4 font-serif text-[16px] leading-[1.7] text-ink">
              {fb.coach_reply}
            </p>
          )}
          <p className="mt-4 text-[14.5px] leading-relaxed text-ink-muted">
            We did not check the grammar of this entry, on purpose. Your writing is safe and
            nothing is lost.
          </p>
        </section>
        <section className="rounded-2xl border border-accent/25 bg-accent-soft p-5">
          <Eyebrow>If you need someone now</Eyebrow>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">
            If you are in danger right now, please call your local emergency number.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">
            You can find a free, confidential helpline for your country at{" "}
            <strong className="font-semibold">findahelpline.com</strong>. Talking to a person you
            trust — a friend, family, a doctor — can help more than writing alone.
          </p>
        </section>
        <section className="rounded-2xl border border-rule bg-card p-5">
          <Eyebrow>Your writing</Eyebrow>
          <p className="mt-3 whitespace-pre-wrap font-serif text-[16.5px] leading-[1.75] text-ink">
            {entry.text}
          </p>
        </section>
      </div>
    );
  }

  const rate = per100(entry);

  /* -----------------------------------------------------------------------
     One vertical scrolling page (ADR 0003), in the order the teaching is
     meant to happen: message → every change → corrected text → legacy
     appendix (only on entries that carry it) → closing. The document
     scrolls; no section here carries h-full/min-h-0/flex-1/overflow-y-auto.
  ----------------------------------------------------------------------- */
  return (
    <div className="flex flex-col gap-4">
      <header>{back}</header>

      <section className="rounded-2xl border border-rule bg-card p-5">
        <h1 className="eyebrow block">
          {new Date(entry.createdAt).toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · {entry.wordCount} words · {fb.corrections.length}{" "}
          {fb.corrections.length === 1 ? "correction" : "corrections"}
        </h1>
        {/* The teacher's message is prose, not a heading — a 160-word
            headline was never a heading (ADR 0003). */}
        {fb.teacher_feedback ? (
          <p className="mt-3 whitespace-pre-wrap font-serif text-2xl leading-snug text-pretty">
            {fb.teacher_feedback}
          </p>
        ) : (
          <p className="mt-3 font-serif text-[27px] leading-[1.14] text-pretty">
            {fb.corrections.length === 0
              ? "Nothing to correct this time."
              : `${fb.corrections.length} ${fb.corrections.length === 1 ? "correction" : "corrections"} to read.`}
          </p>
        )}
        {/* Legacy-only fallback: entries with no teacher_feedback (pre
            PROMPT_VERSION 7) carry these fields instead. */}
        {!fb.teacher_feedback && fb.one_thing_to_fix && (
          <div className="mt-5 border-l-2 border-accent pl-3.5">
            <Eyebrow>One thing to fix</Eyebrow>
            <p className="mt-2 font-serif text-[17px] leading-[1.5]">
              {fb.one_thing_to_fix}
            </p>
          </div>
        )}
        {!fb.teacher_feedback && fb.what_went_well && (
          <div className="mt-5">
            <Eyebrow>What went well</Eyebrow>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
              {fb.what_went_well}
            </p>
          </div>
        )}
      </section>

      {/* Every change, in diff order — the reading order of the learner's
          own text, never re-sorted by severity, so this list reads line for
          line with the corrected text below it. `ambiguous` folds in as a
          trailing block under this same section rather than earning a
          section of its own (ADR 0002 Part A intent, carried into 0003). */}
      <section className="rounded-2xl border border-rule bg-card p-5">
        <Eyebrow>
          {fb.corrections.length} {fb.corrections.length === 1 ? "change" : "changes"}
        </Eyebrow>
        <h2 className="mt-3 font-serif text-[25px] leading-[1.18] text-pretty">
          Every change, one by one.
        </h2>
        {fb.corrections.length > 0 && (
          <ul className="mt-5 flex flex-col divide-y divide-rule">
            {fb.corrections.map((c, index) => {
              const legacyPattern = fb.patterns?.find((p) => p.category === c.category);
              return (
                <li key={index} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    {/* `!` forces this above .eyebrow's own text-ink-faint: both
                        land in the same Tailwind layer, and .eyebrow is emitted
                        later in the compiled CSS, so without it .eyebrow's
                        color would silently win (same bug as ErrorLog.tsx's
                        accent heading — WORK-04/WORK-21 follow-up). */}
                    <span className="eyebrow text-accent!">{labelFor(c.category)}</span>
                  </div>
                  {/* No chips here. "Your teacher picked this one" and
                      "#N on your checklist" were two pills on top of a
                      category label, a quoted edit and a rule — four
                      weights of type per row, twelve rows deep. The
                      checklist number still does its work on the
                      Patterns screen, where the map it refers to lives;
                      `fb.highlighted` and `pattern_id` both stay stored
                      and are untouched. */}
                  <div className="mt-3 border-l-2 border-accent pl-3.5">
                    <p className="font-serif text-lg leading-[30px]">
                      <EditSpan original={c.original} corrected={c.corrected} />
                    </p>
                  </div>
                  {/* One quiet line, not a labelled panel: the rule is at
                      most 20 words and it sits under twelve of these.
                      Suppressed on an exact repeat — the same sentence
                      printed five times is what made this section long. */}
                  {showRule[index] && (
                    <p className="mt-2.5 text-[14.5px] leading-[1.55] text-ink-muted">
                      {c.explanation ?? c.rule}
                    </p>
                  )}
                  {/* History for this category, on its first row only (same
                      reasoning as showRule). "Nth time" is computed relative
                      to the entry being viewed, never all-time (stats.ts) —
                      reopening an old entry must keep reporting what was true
                      then. Never "fixed" or "mastered": a correction on this
                      very screen is by definition happening now. */}
                  {categoryHistories.has(index) &&
                    categoryHistories.get(index)!.occurrenceNumber > 1 &&
                    (() => {
                      const h = categoryHistories.get(index)!;
                      // Deliberately "this", not the category name. The name is
                      // already the row's own label directly above, so naming it
                      // again was redundant — and it forced a verb agreement the
                      // label cannot satisfy: plural labels ("Articles (a / an /
                      // the)") produced "articles has come up", a grammar mistake
                      // printed by a grammar teacher.
                      return (
                        <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-faint">
                          This is the {ordinal(h.occurrenceNumber)} time this has come up.
                          {h.previousExample && (
                            <>
                              {" "}
                              Last time: “{h.previousExample.original}” → “
                              {h.previousExample.corrected}”.
                            </>
                          )}
                        </p>
                      );
                    })()}
                  {/* "You could also say" — passive reading only, never
                      a choice (ADR 0002 Part B). Deliberately no
                      EditSpan, no accent rule bar, no tick: this is not
                      a correction and must never look like one.
                      Pattern-sourced rows never reach here — they
                      consumed no note, so they have no entry in
                      altsByIndex. */}
                  {altsByIndex.has(index) && (
                    <div className="mt-3">
                      <Eyebrow>You could also say</Eyebrow>
                      <ul className="mt-2 flex flex-col gap-1">
                        {altsByIndex.get(index)!.map((phrasing, k) => (
                          <li
                            key={k}
                            className="font-serif text-[14.5px] italic leading-[1.6] text-ink-soft"
                          >
                            {phrasing}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {legacyPattern && legacyPattern.explanation && (
                    <div className="mt-3">
                      <Eyebrow>Why it keeps happening</Eyebrow>
                      <p className="mt-2 font-serif text-[15px] leading-[1.6] text-ink-soft">
                        {legacyPattern.explanation}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {fb.corrections.length === 0 && !(fb.ambiguous && fb.ambiguous.length > 0) && (
          <p className="mt-5 text-[14.5px] leading-relaxed text-ink-muted">
            Nothing to correct this time.
          </p>
        )}
        {fb.ambiguous && fb.ambiguous.length > 0 && (
          <div className={fb.corrections.length > 0 ? "mt-5 border-t border-rule pt-5" : "mt-5"}>
            <Eyebrow>We did not guess</Eyebrow>
            <h3 className="mt-2 font-serif text-[19px] leading-[1.25] text-pretty">
              {fb.ambiguous.length === 1
                ? "One sentence could mean two things"
                : "Some sentences could mean two things"}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              We left these unchanged instead of choosing for you. Next entry, you could say
              it the way you meant it.
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-rule">
              {fb.ambiguous.map((a, k) => (
                <li key={k} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-serif text-[15px] leading-[1.55] text-ink">
                    {a.question}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Gone quiet — the honest form of "now it's fixed": an observation
            about absence (getQuietCategories), never a claim of mastery. A
            correction on this screen is happening now, so its category can
            never appear here too (see getQuietCategories). */}
        {quietCategories.length > 0 && (
          <div
            className={
              fb.corrections.length > 0 || (fb.ambiguous && fb.ambiguous.length > 0)
                ? "mt-5 border-t border-rule pt-5"
                : "mt-5"
            }
          >
            <ul className="flex flex-col gap-1">
              {quietCategories.map((q) => (
                <li key={q.category} className="text-[12.5px] leading-[1.5] text-ink-faint">
                  {labelFor(q.category).split(" (")[0]} has not come up in your last {q.entriesSince}{" "}
                  entries.
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Only when the entry stored corrected text — always true for a
          current entry; a stored shape could in principle carry an empty
          string, in which case this section is skipped (ADR 0003). */}
      {fb.corrected_text && (
        <section className="rounded-2xl border border-rule bg-card p-5">
          <Eyebrow>Your writing, put right</Eyebrow>
          <h2 className="mt-3 font-serif text-[22px] leading-[1.2] text-pretty">
            Every change, in one piece.
          </h2>
          <p className="mt-4 whitespace-pre-wrap font-serif text-[16.5px] leading-[1.75] text-ink">
            {buildSegments(
              fb.corrected_text,
              fb.corrections.map((c) => c.corrected)
            ).map((seg, k) =>
              seg.highlighted ? <mark key={k}>{seg.text}</mark> : <span key={k}>{seg.text}</span>
            )}
          </p>
        </section>
      )}

      {/* "How an English speaker might say it" (ADR 0004) — a sentence the
          learner got right, so this is never a correction. Its own section,
          structurally invisible when there is nothing to show: rendered only
          when natural_phrasings is non-empty, never folded into "Every
          change" (that heading carries the correction count) and never given
          an empty state. No EditSpan, no accent rule bar, no tick, nothing
          interactive — passive reading only, exactly like "You could also
          say" above. */}
      {fb.natural_phrasings && fb.natural_phrasings.length > 0 && (
        <section className="rounded-2xl border border-rule bg-card p-5">
          <h2 className="font-serif text-[22px] leading-[1.2] text-pretty">
            How an English speaker might say it
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            Both of these are correct — this is just what people say more often.
          </p>
          {fb.natural_phrasings.map((n, k) => (
            <div key={k} className="mt-4 border-l-2 border-accent/40 pl-3.5">
              <p className="text-[14.5px] leading-[1.6] text-ink-soft">You wrote: {n.original}</p>
              <p className="mt-2 font-serif text-lg leading-[1.5] text-ink">{n.phrasing}</p>
              {n.note && (
                <p className="mt-2 text-[12.5px] leading-[1.5] text-ink-faint">{n.note}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Legacy appendix: the 9-agent-era sections no current entry can
          produce (ADR 0002 Part A intent, carried into 0003). Shown only
          when the entry carries at least one — see hasLegacyAppendix. No
          wrapper heading is invented; each block keeps its own existing
          heading, and the markup below is unchanged. */}
      {hasLegacyAppendix(fb) && (
        <section className="rounded-2xl border border-rule bg-card p-5">
          {fb.pattern_watch && (
            <div className="border-t border-rule pt-6 first:border-t-0 first:pt-0">
              <Eyebrow>This one came back</Eyebrow>
              <h2 className="mt-2 font-serif text-[22px] leading-[1.2] text-pretty">
                {labelFor(fb.pattern_watch.category)}
              </h2>
              <p className="mt-2 text-[14.5px] text-ink-soft">
                {fb.pattern_watch.entries_clean}{" "}
                {fb.pattern_watch.entries_clean === 1 ? "entry" : "entries"} without it before
                this one.
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
                {fb.pattern_watch.note}
              </p>
              <div className="mt-4 border-l-2 border-accent bg-accent-soft px-4 py-3.5">
                <Eyebrow>Say this out loud</Eyebrow>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">
                  {fb.pattern_watch.practice}
                </p>
              </div>
            </div>
          )}
          {fb.fluency_notes && fb.fluency_notes.length > 0 && (
            <div className="border-t border-rule pt-6 first:border-t-0 first:pt-0">
              <Eyebrow>Nothing was wrong here</Eyebrow>
              <h2 className="mt-2 font-serif text-[22px] leading-[1.2] text-pretty">
                These would sound more natural
              </h2>
              <ul className="mt-4 flex flex-col divide-y divide-rule">
                {fb.fluency_notes.map((n, k) => (
                  <li key={k} className="py-4 first:pt-0 last:pb-0">
                    <p className="font-serif text-[17px] leading-[1.5]">
                      <EditSpan original={n.before} corrected={n.after} tone="improvement" />
                    </p>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                      {n.why}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fb.vocabulary && fb.vocabulary.length > 0 && (
            <div className="border-t border-rule pt-6 first:border-t-0 first:pt-0">
              <Eyebrow>Words to learn</Eyebrow>
              <h2 className="mt-2 font-serif text-[22px] leading-[1.2] text-pretty">
                From what you were writing about
              </h2>
              <ul className="mt-4 flex flex-col divide-y divide-rule">
                {fb.vocabulary.map((v, k) => (
                  <li key={k} className="py-4 first:pt-0 last:pb-0">
                    <p className="font-serif text-[19px] leading-tight">{v.term}</p>
                    <p className="mt-1 font-mono text-[12.5px] text-accent">
                      <span className="sr-only">Say it as </span>
                      {v.stress}
                    </p>
                    <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                      {v.meaning}
                    </p>
                    <p className="mt-1 font-serif text-[14px] italic leading-relaxed text-ink-soft">
                      {v.example}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fb.drills && fb.drills.length > 0 && (
            <div className="border-t border-rule pt-6 first:border-t-0 first:pt-0">
              {/* Each Drill already carries its own "Practice · n of of"
                  eyebrow and heading — no wrapper heading here, so the
                  word "Practice" is not said twice in a row. */}
              <ul className="flex flex-col divide-y divide-rule">
                {fb.drills.map((d, k) => (
                  <li key={k} className="py-5 first:pt-0 last:pb-0">
                    <Drill
                      prompt={d.prompt}
                      hint={d.hint}
                      answer={d.answer}
                      distractors={d.distractors ?? []}
                      n={k + 1}
                      of={fb.drills!.length}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* The arithmetic ends the page: the per-100 number, the prior-entry
          comparison, legacy scores and cefr_estimate. After the teaching,
          never before it, never in a header, never sticky (ADR 0003). */}
      <section className="rounded-2xl border border-rule bg-card p-5">
        <Eyebrow>End of this entry</Eyebrow>
        <h2 className="mt-3 font-serif text-[26px] leading-[1.16] text-pretty">
          {rate === null
            ? "That is everything for this entry."
            : `${rate.toFixed(1)} errors per 100 words this time.`}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          {priorRate === null
            ? "Lower is better — this counts mistakes fairly whether you write 50 words or 400."
            : `Your last entry was ${priorRate.toFixed(1)}. Lower is better — this counts mistakes fairly whether you write 50 words or 400.`}
        </p>
        {/* The per-100 figure is NOT repeated as a stat here: the headline
            above already states it as a sentence, and a sentence teaches
            where a bare number only grades. Seen printing "14.6" twice in
            one card when the screen was first driven in a browser. The list
            survives only for cefr_estimate, which legacy entries carry and
            nothing else states. */}
        {fb.cefr_estimate && (
          <dl className="mt-6 flex border-y border-rule">
            <div className="flex-1 py-4">
              <dd className="tnum font-mono text-[26px] leading-none">{fb.cefr_estimate}</dd>
              <dt className="eyebrow mt-1.5">This entry</dt>
            </div>
          </dl>
        )}
        {fb.scores && (
          <dl className="mt-6 flex border-y border-rule">
            <div className="flex-1 py-4">
              <dd className="tnum font-mono text-[26px] leading-none">{fb.scores.grammar}</dd>
              <dt className="eyebrow mt-1.5">Grammar</dt>
            </div>
            <div className="flex-1 border-l border-rule py-4 pl-4">
              <dd className="tnum font-mono text-[26px] leading-none">
                {fb.scores.vocabulary}
              </dd>
              <dt className="eyebrow mt-1.5">Vocabulary</dt>
            </div>
            <div className="flex-1 border-l border-rule py-4 pl-4">
              <dd className="tnum font-mono text-[26px] leading-none">
                {fb.scores.naturalness}
              </dd>
              <dt className="eyebrow mt-1.5">Natural</dt>
            </div>
          </dl>
        )}
        {fb.coach_reply && (
          <div className="mt-5 rounded-2xl bg-accent-soft p-4">
            <p className="font-serif text-[15px] italic leading-[1.65] text-ink-muted">
              {fb.coach_reply}
            </p>
            <Eyebrow>Your coach</Eyebrow>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate({ name: "write" })}
            className="min-h-11 rounded-full bg-accent font-semibold text-paper"
          >
            Write the next entry
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: "log" })}
            className="min-h-11 rounded-full border border-rule-strong text-sm font-medium text-ink-muted"
          >
            See all your patterns
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * A drill with real distractors is a choice, not a recall test — the learner
 * taps an option and finds out. Options are sorted alphabetically so the
 * right answer has no positional tell. Legacy drills have no distractors and
 * fall back to the old show-the-answer flow.
 */
function Drill({
  prompt,
  hint,
  answer,
  distractors,
  n,
  of,
}: {
  prompt: string;
  hint: string;
  answer: string;
  distractors: string[];
  n: number;
  of: number;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const options = useMemo(
    () => (distractors.length > 0 ? [answer, ...distractors].sort((a, b) => a.localeCompare(b)) : []),
    [answer, distractors]
  );
  const solved = picked === answer || shown;
  return (
    <>
      {/* `!` forces this above .eyebrow's own text-ink-faint — see the same
          note on the correction card's category label above. */}
      <span className="eyebrow block text-accent!">
        Practice · {n} of {of}
      </span>
      <h2 className="mt-3 font-serif text-[25px] leading-[1.18] text-pretty">Try this one</h2>
      <div className="mt-5 rounded-2xl bg-sunk p-4">
        <p className="font-serif text-lg leading-[1.7]">{prompt}</p>
      </div>
      {options.length > 0 ? (
        <div className="mt-5">
          <Eyebrow>Pick the right one</Eyebrow>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {options.map((opt) => {
              const isPicked = picked === opt;
              const cls = !isPicked
                ? "border-rule-strong text-ink"
                : opt === answer
                  ? "border-accent bg-accent text-paper"
                  : "border-warn/40 bg-warn-soft text-warn line-through";
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPicked(opt)}
                  className={`min-h-11 rounded-full border px-4 font-serif text-[15.5px] ${cls}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {picked !== null && picked !== answer && (
            <p className="mt-3 text-[13.5px] text-ink-soft">Not that one — try again.</p>
          )}
          {picked === answer && (
            <p className="mt-3 text-[13.5px] font-medium text-accent">
              Yes — “{answer}”.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5 border-t border-rule pt-3.5">
          <Eyebrow>Answer</Eyebrow>
          {solved ? (
            <p className="mt-2 font-serif text-[17px] leading-[1.5] text-accent">{answer}</p>
          ) : (
            <button
              type="button"
              onClick={() => setShown(true)}
              className="mt-2 min-h-11 text-[13px] font-medium text-accent"
            >
              Show it after you have tried
            </button>
          )}
        </div>
      )}
      <div className="mt-5 border-l-2 border-accent/40 pl-3.5">
        <Eyebrow>Hint</Eyebrow>
        <p className="mt-2 font-serif text-[14.5px] italic leading-[1.55] text-ink-soft">{hint}</p>
      </div>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { Screen } from "../App";
import ErrorNote from "../components/ErrorNote";
import EditSpan from "../components/EditSpan";
import { getEntries, getEntry, per100, previousRate, requeueFailedEntry, type Entry } from "../lib/db";
import { processQueue } from "../lib/queue";
import { canRequeue } from "../lib/claim";
import { FAIL_REASON_MESSAGES, labelFor } from "../lib/categories";
import { buildSegments } from "../lib/highlight";
import { buildFeedbackCards } from "../lib/cards";
import { useLoad } from "../lib/useLoad";

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
  // The one condition under which the branch far below actually renders the
  // carousel that owns `stackRef` — loading/failed/pending screens don't,
  // and deliberately neither does the acute branch, which must never receive
  // focus stolen onto a crisis screen.
  const isNormalEntry = fb !== null && fb.risk !== "acute";
  const cards = useMemo(() => (fb && isNormalEntry ? buildFeedbackCards(fb) : []), [fb, isNormalEntry]);
  const priorRate = useMemo(
    () => (entry && historyState.status === "ready" ? previousRate(historyState.data, entry.id) : null),
    [entry, historyState]
  );

  const [i, setI] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);

  // The instruction below reads "use ← →", so the container that handles
  // those keys must actually be reachable and focused without the learner
  // having to discover a button to Tab into first. Gated on `isNormalEntry`
  // rather than running on mount: on mount the entry is still loading, the
  // carousel branch below hasn't rendered, and `stackRef` is null, so an
  // unconditional effect never actually focuses anything. Waiting for
  // `isNormalEntry` to flip true — the moment the branch that owns
  // `stackRef` is what's on screen — is what makes it fire. This is also
  // the deliberate reason the acute branch never receives focus here: it is
  // excluded from `isNormalEntry` by definition, not merely because it
  // happens to render no `stackRef` node. Never remove that check to "fix"
  // this effect — a crisis screen must not have focus moved onto it.
  useEffect(() => {
    if (isNormalEntry) stackRef.current?.focus();
  }, [isNormalEntry]);

  const go = (d: number) => {
    setDx(0);
    setDragging(false);
    setI((prev) => Math.min(cards.length - 1, Math.max(0, prev + d)));
  };

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

  const card = cards[i];
  const rate = per100(entry);
  const highlightedSet = new Set(fb.highlighted ?? []);

  return (
    <div
      ref={stackRef}
      tabIndex={0}
      role="group"
      aria-roledescription="carousel"
      aria-label="Feedback cards"
      className="flex h-full flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        startX.current = e.clientX;
        setDragging(true);
        setDx(0);
      }}
      onPointerMove={(e) => dragging && setDx(e.clientX - startX.current)}
      onPointerUp={() => {
        if (!dragging) return;
        if (dx < -60) go(1);
        else if (dx > 60) go(-1);
        else {
          setDx(0);
          setDragging(false);
        }
      }}
      onPointerCancel={() => {
        setDx(0);
        setDragging(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      style={{ touchAction: "pan-y" }}
    >
      <div className="flex items-center justify-between">
        {back}
        <span className="eyebrow tnum" aria-live="polite">
          Card {String(i + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}
        </span>
      </div>

      <ol className="mt-3 flex gap-1.5" aria-hidden>
        {cards.map((_, n) => (
          <li key={n} className="h-[3px] flex-1 rounded-sm bg-rule">
            <span className={`block h-[3px] rounded-sm bg-accent ${n <= i ? "w-full" : "w-0"}`} />
          </li>
        ))}
      </ol>

      <div className="relative mt-5 min-h-0 flex-1">
        {i < cards.length - 1 && (
          <div aria-hidden className="absolute inset-x-3.5 -bottom-0 top-2.5 rounded-[20px] border border-rule bg-sunk" />
        )}
        {i < cards.length - 2 && (
          <div aria-hidden className="absolute inset-x-1.5 -bottom-0 top-1 rounded-[20px] border border-rule bg-paper" />
        )}

        <article
          className="relative box-border h-full overflow-y-auto rounded-[20px] border border-rule bg-card p-6"
          style={{
            transform: `translateX(${dx}px) rotate(${dx * 0.012}deg)`,
            transition: dragging ? "none" : "transform .28s cubic-bezier(.32,.72,0,1)",
            opacity: dragging ? Math.max(0.55, 1 - Math.abs(dx) / 420) : 1,
          }}
        >
          {card.kind === "message" && (
            <>
              {/* The teacher's message is the feedback the learner actually
                  experiences, so it leads the card; the count that used to
                  head this card demotes to the eyebrow line beside it
                  (ui-guidelines.md: never a scoreboard before the teaching). */}
              <Eyebrow>
                {new Date(entry.createdAt).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {entry.wordCount} words · {fb.corrections.length}{" "}
                {fb.corrections.length === 1 ? "correction" : "corrections"}
              </Eyebrow>
              {fb.teacher_feedback ? (
                <h1 className="mt-3 whitespace-pre-wrap font-serif text-2xl leading-snug text-pretty">
                  {fb.teacher_feedback}
                </h1>
              ) : (
                <h1 className="mt-3 font-serif text-[27px] leading-[1.14] text-pretty">
                  {fb.corrections.length === 0
                    ? "Nothing to correct this time."
                    : `${fb.corrections.length} ${fb.corrections.length === 1 ? "correction" : "corrections"} to read.`}
                </h1>
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
            </>
          )}

          {/* Card 2: every change as one scrollable list, in diff order — the
              reading order of the learner's own text, never re-sorted by
              severity, so this list reads line for line with card 3.
              `ambiguous` folds in as a trailing block rather than earning
              its own card (ADR 0002 Part A). */}
          {card.kind === "changes" && (
            <div className="flex h-full flex-col">
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
                        {(highlightedSet.has(index) || c.pattern_id !== undefined) && (
                          <p className="mt-2 flex flex-wrap gap-1.5">
                            {highlightedSet.has(index) && (
                              <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-paper">
                                Your teacher picked this one
                              </span>
                            )}
                            {c.pattern_id !== undefined && (
                              <span className="tnum rounded-full bg-ink/5 px-2.5 py-1 text-[11px] text-ink-soft">
                                #{c.pattern_id} on your checklist
                              </span>
                            )}
                          </p>
                        )}
                        <div className="mt-3 border-l-2 border-accent pl-3.5">
                          <p className="font-serif text-lg leading-[30px]">
                            <EditSpan original={c.original} corrected={c.corrected} />
                          </p>
                        </div>
                        <div className="mt-3 rounded-2xl bg-sunk p-4">
                          <Eyebrow>The rule</Eyebrow>
                          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
                            {c.explanation ?? c.rule}
                          </p>
                        </div>
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
            </div>
          )}

          {/* Legacy appendix (ADR 0002 Part A): the 9-agent-era sections no
              current entry can produce, folded into one card before closing
              rather than each earning its own. Shown only when at least one
              is present — `buildFeedbackCards` already gates this. */}
          {card.kind === "appendix" && (
            <div className="flex h-full flex-col">
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
            </div>
          )}

          {card.kind === "corrected" && (
            <div className="flex h-full flex-col">
              <Eyebrow>Your writing, put right</Eyebrow>
              <h2 className="mt-3 font-serif text-[22px] leading-[1.2] text-pretty">
                Every change, in one piece.
              </h2>
              <p className="mt-4 overflow-y-auto whitespace-pre-wrap font-serif text-[16.5px] leading-[1.75] text-ink">
                {buildSegments(
                  fb.corrected_text,
                  fb.corrections.map((c) => c.corrected)
                ).map((seg, k) =>
                  seg.highlighted ? <mark key={k}>{seg.text}</mark> : <span key={k}>{seg.text}</span>
                )}
              </p>
            </div>
          )}

          {card.kind === "closing" && (
            <div className="flex h-full flex-col">
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
              <dl className="mt-6 flex border-y border-rule">
                <div className="flex-1 py-4">
                  <dd className="tnum font-mono text-[26px] leading-none">
                    {rate === null ? "—" : rate.toFixed(1)}
                  </dd>
                  <dt className="eyebrow mt-1.5">Per 100 words</dt>
                </div>
                {fb.cefr_estimate && (
                  <div className="flex-1 border-l border-rule py-4 pl-4">
                    <dd className="tnum font-mono text-[26px] leading-none">{fb.cefr_estimate}</dd>
                    <dt className="eyebrow mt-1.5">This entry</dt>
                  </div>
                )}
              </dl>
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
              <div className="mt-auto flex flex-col gap-2.5 pt-5">
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
            </div>
          )}
        </article>
      </div>

      <div className="flex items-center justify-between py-4">
        <span className="text-[12.5px] text-ink-faint">
          {i === cards.length - 1 ? "That is everything" : "Drag the card, or use ← →"}
        </span>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={i === 0}
            aria-label="Previous card"
            className="flex size-11 items-center justify-center rounded-full border border-rule-strong text-ink-soft disabled:opacity-35"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={i === cards.length - 1}
            aria-label="Next card"
            className="flex size-11 items-center justify-center rounded-full bg-accent text-paper disabled:opacity-35"
          >
            ›
          </button>
        </div>
      </div>
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

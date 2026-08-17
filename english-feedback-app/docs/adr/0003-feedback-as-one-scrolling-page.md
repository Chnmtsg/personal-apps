# 0003. Feedback is one scrolling page, not a card stack

## Status: accepted (2026-08-12) — supersedes ADR 0002 **Part A** only

ADR 0002 Part B (alternative phrasings, the `alternatives` array outside
`Correction`, `PROMPT_VERSION` 8) is **not** reopened by this ADR and stands
exactly as written. Only the container it renders in changes.

This is a new record rather than a rewrite of 0002 on purpose: Part B is live,
and its reasoning has to stay readable without a superseded Part A tangled
through it. 0002's Status line is amended to point here; its body is left
alone, because the four-card stack was the right decision on the evidence that
existed this morning and a later reader should be able to see why.

## Context

ADR 0002 Part A shipped this morning (commits `48eba47`, `646763d`). It
replaced one swipeable card per correction with a fixed four-card stack. That
was a real improvement — a 12-error entry stopped being 15 swipes — and it is
not being undone because it failed.

The owner, the app's first learner, still reports the screen as messy. The
diagnosis is not the content and not the card count. It is that the screen now
carries **two navigation models at once**:

- horizontally, swipe/drag/arrow-keys/prev-next between four cards;
- vertically, `overflow-y-auto` inside the changes card, and inside the
  corrected-text card.

The learner has to work out which gesture does what, and the content below a
card's fold has *no affordance at all* — the only visible cues (the ghost
cards, the ‹ › buttons, the "Drag the card, or use ← →" line, the card
counter) all point sideways. WORK-18 had to add `tabIndex`, a focus-on-mount
effect and an `aria-live` counter today just to make the horizontal model
honest for keyboard users; that is a lot of machinery to make a gesture
discoverable that the phone never taught in the first place.

With one card per correction, the carousel bought something: it stopped a
12-error entry arriving as one wall. With exactly four cards it buys nothing —
four blocks is a page, and a page is the one gesture every phone already
taught.

The decision is the owner's and is recorded here, not re-argued.

## Decision

The Feedback screen for a normal entry is **one vertical page**, scrolled by
the document, in the order the teaching is meant to happen:

| # | Section | Content |
|---|---|---|
| 1 | The message | the date · word count · correction count line, then `teacher_feedback`. Legacy `one_thing_to_fix` / `what_went_well` fallbacks unchanged. |
| 2 | Every change | the whole of `corrections` as one list, in diff order. `ambiguous` stays a trailing block under a rule, headed "We did not guess". |
| 3 | Your writing, put right | `corrected_text` with `buildSegments` highlighting. Unchanged. |
| 4 | Legacy appendix | `pattern_watch`, `fluency_notes`, `vocabulary`, `drills` — only on entries that carry them. Markup moves verbatim. |
| 5 | Closing | the per-100 rate, the prior-entry comparison, legacy `scores` / `cefr_estimate` / `coach_reply`, the two actions. Unchanged. |

Sections 1–3 and 5 are always present (3 only when `corrected_text` is
non-empty, as today). Section 4 appears only when the stored entry has one of
those fields.

**Cards do not disappear as a container, only as a step in a stack.** Each
section is the same `<section className="rounded-2xl border border-rule
bg-card p-5">` used by every other screen in this app — and already used by
this screen's own pending, failed and acute branches — inside a
`<div className="flex flex-col gap-4">`. Visually the learner sees a familiar
stack of paper; there is simply nothing to swipe. This keeps
`ui-guidelines.md`'s Cards section intact and confines the change to Screens.

**The document scrolls, not a box.** `h-full`, `min-h-0`, `flex-1` and
`overflow-y-auto` come off these sections. `App.tsx`'s `<main>` already carries
the bottom-nav and safe-area padding, so the page gets native momentum, a real
scrollbar and correct inset behaviour for free.

**The arithmetic stays at the bottom.** The per-100-words number, the prior-entry
comparison, `scores` and `cefr_estimate` end the page. The teacher's words come
first; that is why the summary card's score block was deleted in the first
place, and one page makes it easier to violate, not harder — everything is now
in reach of a header. It does not move up, and it does not become sticky.

### Heading structure and landmark order

This is the replacement for the deleted carousel semantics, and it must be an
improvement, not a quiet regression.

```
<main>                       (App.tsx, unchanged)
  <header>  ‹ History        (the only thing in it)
  <section> h1  Thu 12 Aug · 214 words · 6 corrections
            p   teacher_feedback (serif, visually unchanged)
  <section> h2  Every change, one by one.
            …rows…
            h3  Some sentences could mean two things   (ambiguous)
  <section> h2  Every change, in one piece.            (corrected text)
  <section> h2  …legacy blocks, existing headings…     (only if present)
  <section> h2  4.2 errors per 100 words this time.
<nav>                        (App.tsx, unchanged)
```

- **Exactly one `<h1>`, and it is the entry's identity line** — the date, word
  count and correction count that is already on screen as the eyebrow. It keeps
  its `.eyebrow` styling; a heading does not have to be large, and
  `Settings.tsx` already uses `<h2 className="eyebrow">`. Nothing about the
  visual hierarchy changes.
- **`teacher_feedback` stops being an `<h1>` and becomes a `<p>`**, styled
  identically. A 160-word heading is not a heading; it is prose that happens to
  be set large. This is the one semantic upgrade the change buys outright.
  The legacy no-`teacher_feedback` headline ("6 corrections to read.") becomes
  the same `<p>` — one less heading decision, no visual change.
- **`<h2>` per top-level section, in visual order. No skipped levels.** `h3`
  only nested inside a section (the ambiguous block, which is already an `h3`).
  The legacy `Drill` component is not touched; its `h2` stays valid because the
  drills block is a top-level section.
- **Plain `<section>` elements — no `role="region"`, no `aria-label`, no
  `aria-labelledby`.** Named regions would put five more stops in the landmark
  list of a screen whose whole structure is already carried by its headings.
- **Nothing announces and nothing takes focus.** The counter's `aria-live` goes
  with the counter: a live region over content that never changes is noise. The
  focus-on-mount effect goes with the arrow keys it existed to serve.

**Route-level focus is a separate, pre-existing, app-wide issue.** All five
screens swap inside `<main>` without moving focus. This ADR does not fix it and
does not paper over it with a bespoke effect in `Feedback.tsx` — if it is ever
fixed it belongs in `App.tsx`, once, for every screen. A real `<h1>` on this
page is what makes heading navigation land somewhere sensible in the meantime.

### `app/src/lib/cards.ts`

The file is renamed to **`app/src/lib/feedbackSections.ts`**, and
`tests/cards.test.ts` to `tests/feedbackSections.test.ts`. Two import sites. A
file called `cards.ts` in a codebase with no cards is exactly the kind of stale
name that makes the next reader distrust the record.

| Export | Ruling |
|---|---|
| `FeedbackCard` type | **Delete.** Nothing has a kind any more. |
| `buildFeedbackCards` | **Delete.** Its whole product was an ordered list of card kinds for an index to walk. Section order is now literal JSX, read top to bottom. |
| `hasAppendix` | **Keep and export**, renamed `hasLegacyAppendix`. The "show only when the entry carries them" decision is still a real decision about stored data, it is still pure, and it still belongs out of JSX where it can be tested. |
| `explanationRows` | **Untouched.** Same code, same six tests, same behaviour. A long page makes it more load-bearing, not less: it is what stops the same article rule printing five times down one scroll. |

Of the eight `buildFeedbackCards` tests: **three port, five go.**

- Port to `hasLegacyAppendix` — the legacy-fields case, the one-field-only case,
  and the empty-arrays case. Add the current-pipeline case (`false`). These
  assert something the page still promises: legacy content appears if and only
  if it is stored.
- Delete — "exactly four cards", "count does not grow with corrections", "zero
  corrections is still four cards", "ambiguous folds in rather than earning its
  own card", "no `corrected_text` skips the corrected card". The card-count
  invariant they defend stops existing on the day cards do. Two of them
  (ambiguous folding in; the corrected section being conditional) still encode
  live intent, but that intent is now a JSX conditional and cannot be tested
  without a DOM library. It moves into a comment at the conditional and onto the
  manual checklist below — **not** into a shim function invented so a test has
  something to call.

Net: `tests/feedbackSections.test.ts` keeps six `explanationRows` tests and
gains four `hasLegacyAppendix` tests.

### The legacy appendix

Between the corrected text and the closing section, in the same relative
position it holds in the stack today. Its internal markup moves **verbatim** —
same blocks, same order (`pattern_watch`, `fluency_notes`, `vocabulary`,
`drills`), same `border-t` separators, same untouched `Drill` component, same
existing `h2`s. No wrapper heading is invented: a page can absorb four honest
sections where a fixed stack could not, and "From an earlier version of the
app" is a label for us, not for the learner.

Part A's intent survives: this content is grouped, subordinate, below the
teaching, shown only when stored, and it shrinks out of the app as those
entries age out. Nothing is deleted from storage and nothing is migrated.

### The acute path

Untouched, and it stays a complete early `return` **above** every line of
section rendering, with its own `<div className="flex flex-col gap-4">` and its
own three sections. It is not folded into a shared page wrapper, not given a
heading structure derived from the normal page, and shares no scroll container
with it. No correction, alternative, ambiguity, rate or count can reach it,
because it returns before the code that reads them exists.

`isNormalEntry` and the `stackRef` focus effect are deleted — the carousel they
guarded is gone, so the protection stops being a runtime check and becomes
structural. That is a strengthening, but it removes a named guard whose comment
reads "never remove that check", so **the diff goes through `safety-reviewer`
before commit** even though the acute JSX is byte-identical.

Standing consequence: while that branch lives in this component, **no focus
movement, scroll restoration, `scrollIntoView`, auto-scroll, scroll-spy or
scroll-progress affordance may be added to this screen at all.** Any of those
would be the mechanism by which behaviour built for the teaching page reaches a
crisis screen.

### Nothing else moves

Explicitly, so nobody goes looking: **no stored field is added, removed, read
differently or migrated. No Worker file changes. No prompt changes.
`PROMPT_VERSION` stays 8, `MODEL_ID` stays. `shared/schema.ts`,
`shared/taxonomy.ts`, `worker/`, `prompts/`, `evals/`, `app/src/lib/stats.ts`,
`db.ts`, `api.ts`, `highlight.ts` and `EditSpan` are all untouched.** Zero
Anthropic calls change, so cost and latency per entry are identical at one user
and at 1,000 daily active users. `eval-runner` has nothing to measure here.

The change is `app/src/screens/Feedback.tsx`, `app/src/lib/cards.ts` →
`feedbackSections.ts`, its test file, `docs/architecture.md`,
`../knowledge/ui-guidelines.md`, and this record.

## Consequences

- **One gesture.** The learner scrolls, which is what they were going to do
  anyway. Content below the fold gains the affordance it never had: a page that
  visibly continues.
- **The teaching order is now enforced by the document, not by an index.**
  Message → changes → corrected text → number is literal source order. The one
  way to break it is to make something sticky, which the must-not list forbids.
- **Roughly 90 lines of interaction code go**, along with four pieces of state
  (`i`, `dx`, `dragging`, `startX`), a ref, a `useEffect`, a `useMemo` and six
  event handlers. Fewer moving parts on the screen with the least automated
  coverage in the app.
- **The screen gets longer, and that is the honest version.** A 12-correction
  entry is a long scroll. It was always 12 corrections; the count is stated in
  the first line, so the shape is known before the reading starts, and
  `explanationRows` keeps the repetition out.
- **What we gave up:** the sense of pace a stack gives — the deliberate beat
  between "here is what your teacher said" and "here is every change". A page
  delivers all of it at once and relies on section rules and headings to do
  that work. Accepted: the beat cost two navigation models, and the owner is
  reading the result as mess rather than as pacing.
- **We also gave up the WORK-18 accessibility work**, four hours old. It was
  correct — it fixed a carousel that told users to press keys that did nothing.
  Deleting a fix by deleting the thing it fixed is not a regression, but the
  replacement (one `h1`, ordered `h2`s, no focus theft, no dead live region)
  has to be verified by hand, because nothing in `npm run verify` can see it.
- **Verification is weaker than the change deserves.** There is no DOM testing
  library, so the entire screen is typecheck-plus-eyes. Adding one is a real
  option but it is its own decision with its own cost; it is not smuggled in
  here.

## Stage contract

**No stage.** This is a client render change: no reads from the network, no
writes to storage, no model tier, no failure mode, no retry policy. It is
recorded as an ADR because it supersedes one, and because it changes the
screen the whole pipeline exists to produce.

## How the implementer verifies this without a DOM test library

Say out loud in the commit that this screen has no automated coverage, then do
all of it:

1. `npm run verify` from `english-feedback-app/`. Typecheck catches every dead
   import, every orphaned state variable and the rename; the suite must be
   green with six `explanationRows` tests and four `hasLegacyAppendix` tests.
2. **Tab order.** From page load, Tab should stop on: `‹ History`, then any
   legacy drill buttons, then `Write the next entry`, then
   `See all your patterns` — in that visual order, and on nothing else. A stop
   on a non-interactive container means a `tabIndex` survived.
3. **Keyboard scrolling.** Space, PageDown and End scroll the page with nothing
   focused. End reaches the per-100 block and the two buttons.
4. **Heading tree.** DevTools → Accessibility pane (or any outline extension):
   exactly one `h1`; `h2`s in visual order; no level skipped; the `h3` only
   inside the changes section.
5. **Screen reader smoke.** VoiceOver or TalkBack, headings rotor: h1 → Every
   change → Your writing put right → (legacy, if present) → the closing rate.
   Nothing announces on load; focus is not moved anywhere.
6. **Four entry shapes**, by hand: a 12-correction entry, a 0-correction entry,
   an entry with `ambiguous`, and a legacy 9-agent entry restored through
   Settings → import. Plus the three branches this ADR does not touch —
   pending, failed, and acute — to confirm they still render exactly as before.
7. **Mobile.** 320px wide: no horizontal scroll, touch targets ≥44px, the
   closing buttons clear the tab bar and the home indicator.

## What implementers must not do

- Do **not** keep any part of the carousel: no pointer/drag handlers, no
  `pointercancel`, no arrow-key handler, no prev/next buttons, no card counter,
  no `aria-live` on it, no progress bar, no ghost cards, no `touchAction`, no
  `role="group"`, no `aria-roledescription="carousel"`, no `tabIndex` on a
  container, no focus-on-mount. Delete them. Not behind a flag, not behind a
  media query, not "the stack on desktop".
- Do **not** replace the swipe with a second navigation model of any kind:
  no accordions, no "show more", no tabs, no jump links, no anchors, no
  scroll-spy, no sticky header or footer, no back-to-top button, no scroll
  progress indicator, no scroll-linked animation. One page, one gesture. If
  something is worth reading it is worth being on the page.
- Do **not** move the per-100 number, `scores`, `cefr_estimate` or any
  correction count above the teacher's message, into the header, or into
  anything fixed or sticky. The arithmetic ends the page.
- Do **not** re-sort `corrections`. Diff order is the reading order of the
  learner's own text, which is the only thing that makes the changes list read
  line for line with the corrected text below it.
- Do **not** scroll an inner container. No `overflow-y-auto`, `h-full`,
  `min-h-0` or `flex-1` on these sections — that is the second navigation model
  coming back through the other door.
- Do **not** touch the acute branch's JSX, and do not merge it into a shared
  page wrapper or a shared scroll container. It stays a complete early
  `return`. Do not add focus movement, scroll restoration, `scrollIntoView` or
  auto-scroll anywhere in this component. The removal of `isNormalEntry` and
  the focus effect goes through `safety-reviewer` before commit.
- Do **not** delete or hide the legacy render paths: `pattern_watch`,
  `fluency_notes`, `vocabulary`, `drills`, `scores`, `cefr_estimate`,
  `coach_reply`, `highlighted`, `patterns[]`, `one_thing_to_fix`,
  `what_went_well`. They move; they do not go. Do not touch the `Drill`
  component.
- Do **not** touch `explanationRows` or any of its six tests. Do not "simplify"
  it away because a page can hold more text.
- Do **not** keep the five card-count tests alive by rewriting them against a
  shim, and do not invent a pure function whose only purpose is to give a
  deleted test something to call. A test that asserts a rule the app no longer
  has is worse than no test.
- Do **not** add a stored field, read one differently, backfill, migrate or
  re-analyse anything. Do not touch `shared/`, `worker/`, `prompts/`,
  `PROMPT_VERSION`, `MODEL_ID`, `stats.ts`, `db.ts`, `api.ts`, `highlight.ts`
  or `EditSpan`.
- Do **not** reopen ADR 0002 Part B. Alternatives still render inside the
  taught row, still passive reading, still no `EditSpan`, no accent rule bar,
  no tick, still counted nowhere. A page does not make them a drill.
- Do **not** add a DOM testing library under this ADR. If it is wanted, it gets
  its own ADR and its own cost discussion.
- Do **not** land any other Feedback change in the same commit: no copy
  rewrite, no new content, no Recharts split, no colour work. This commit is
  "the stack becomes a page" and nothing else.
- Do **not** leave the record disagreeing with the code. `docs/architecture.md`
  (the Client paragraph, which names `buildFeedbackCards` and "fixed four-card
  stack") and `../knowledge/ui-guidelines.md` (Screens, and the Cards section's
  ghost-card sentence) are updated in this same commit, using the wording
  below.

## `ui-guidelines.md`: the exact revision

**Cards** — replace the final sentence of the shadow exception:

> The Feedback screen is a single scrolling page of sections, not a stack, so
> nothing on it floats and nothing on it carries a shadow.

**Screens** — replace both Feedback paragraphs with:

> Feedback is one page, scrolled top to bottom in the order the teaching
> happens (ADR 0003): the teacher's message, then every change in the entry as
> one list — in diff order, the reading order of the learner's own text, never
> re-sorted by severity — then the whole corrected text, then the closing
> block. `ambiguous` sits at the end of the changes section rather than
> standing alone. The per-100-words number and any legacy score live in the
> closing block: after the teaching, never before it, never in a header and
> never in anything sticky. There is no swipe, no card stack, no card counter
> and no progress bar — one gesture, vertical, the one the phone already
> taught.
>
> A card is a container, not a step. Sections are cards in a vertical list,
> separated by a hairline rule on `bg-card`, and one section carries one idea.
> A section may run as long as its one idea requires — "every change in this
> entry" is one idea said N times, not N ideas. What a section must never do is
> put a different *kind* of content under the same heading; if it mixes two
> topics it is two sections. Legacy 9-agent-era content (pattern watch, fluency
> notes, vocabulary, drills) sits between the corrected text and the closing
> block, shown only on entries that carry it, and shrinks out of the app as
> those entries age out.
>
> Structure is carried by headings, not by gestures: one `<h1>` per screen,
> `<h2>` per section in visual order, no skipped levels, and no screen moves
> focus on mount.

## `docs/architecture.md`: the Client paragraph

Replace the first two sentences with:

> React PWA. Write → claim → analyse → Feedback: one scrolling page
> (ADR 0003) — the teacher's message, every change as one list in diff order
> (`ambiguous` trailing), the corrected text, then closing, with a legacy
> section before closing on entries that predate ADR 0001.
> `app/src/lib/feedbackSections.ts` holds the two pure decisions that survive:
> which rows print their rule, and whether an entry has legacy content.

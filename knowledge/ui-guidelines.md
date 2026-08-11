# UI Guidelines

## Design Philosophy

Simple.

Clean.

Professional.

A learner reads this screen after being told what they got wrong. Reduce
cognitive load, and never make the feedback feel like a scoreboard.

---

## Colors

The palette is ink on warm paper: one accent (`--color-accent`, #33418f) and
one warning (`--color-warn`, #8a3324). There is deliberately no third hue, so
adding a colour is a decision rather than a convenience.

Every colour is a token in `app/src/index.css`. Screens name tokens
(`bg-paper`, `text-ink-soft`, `border-rule`), never Tailwind palette steps —
a `text-slate-600` anywhere in a screen is a bug.

The accent marks the correction; the warning marks the error and destructive
actions. Scores are not coloured by value: a red bar next to a number is the
scoreboard framing this app exists to avoid.

Never carry meaning in colour alone — pair it with a label or a shape. The
before/after pair uses `<del>`/`<ins>` with screen-reader words, not hue.

---

## Typography

Three families, all self-hosted so an installed app keeps its design offline:
Source Serif 4 for the learner's own words and for headings, IBM Plex Sans for
the interface, IBM Plex Mono for numbers and the small caps `.eyebrow` label.

Set anything the learner reads as prose in the serif. The interface is sans.
Any number meant to be compared down a column gets `.tnum`.

Never below 14px for body text. The user's own writing is shown back to them at
full size, not shrunk to fit.

---

## Spacing

Use an 8px spacing system.

Avoid cramped layouts.

---

## Cards

Consistent padding.

Consistent border radius.

Cards are separated by a hairline rule (`border-rule`) on `bg-card`, not by
shadow. Do not reintroduce shadows for depth.

Exception: a shadow is allowed on an element that is genuinely floating above
the page, not separated from a neighbouring card — the Write screen's Analyse
button and the toast are elevation, not card separation. The Feedback card
stack shows depth with two offset ghost cards behind the top card, not a
shadow, so its `<article>` carries none.

---

## Screens

Most important information first.

Feedback is a swipeable, **fixed** card stack (ADR 0002): the teacher's
message, then every change in the entry as one scrollable list — in diff
order, the reading order of the learner's own text, never re-sorted by
severity — then the whole corrected text, then the closing card. `ambiguous`
folds into the changes card as a trailing block rather than earning its own.
Scores live on the closing card — after the teaching, never before it. Card
count does not grow with how many corrections an entry has; a 12-error entry
and a 1-error entry are both this same four-card stack.

One idea per card, but a card *may* scroll to repeat that one idea — "every
change in this entry" is one idea said N times, not N ideas. What a card must
never do is scroll to reveal a *different kind* of content partway down; if a
card mixes two topics, it is two cards. The one named exception is the
legacy appendix card: entries analysed before ADR 0001 carry 9-agent-era
sections (fluency notes, vocabulary, drills, pattern watch) with no home in
the fixed four, so they share one appendix card before closing, shown only
when present. It is accepted as a legacy artefact, not a pattern to repeat,
and it shrinks out of the app as those entries age out.

Reduce visual clutter.

---

## Mobile

Design mobile-first. This is installed to a phone home screen.

Minimum touch target 44x44 px. This includes back buttons and list rows.

No horizontal scrolling.

Respect `env(safe-area-inset-bottom)` for anything fixed to the bottom.

---

## Accessibility

WCAG AA contrast.

Keyboard friendly.

Visible focus indicators.

Every control has an accessible name. A placeholder is not a label.

Mark the current tab with `aria-current`.

Announce transient messages with `role="status"`.

---

## States

Every screen needs four: loading, empty, error, and populated.

An empty state says what to do next. An error state says what went wrong and
whether the app will retry.

Never render nothing and leave the user guessing.

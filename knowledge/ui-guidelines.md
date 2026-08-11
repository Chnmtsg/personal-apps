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

Feedback is a swipeable card stack, and the card order is the teaching order:
what to fix, then one card per correction, then fluency, words to learn and
drills, then the whole corrected text, then the closing card. Scores live on
the closing card — after the teaching, never before it.

One idea per card. If a card needs a scrollbar to make sense, it is two cards.

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

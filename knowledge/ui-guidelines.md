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
button and the toast are elevation, not card separation. The Feedback screen is
a single scrolling page of sections, not a stack, so nothing on it floats and
nothing on it carries a shadow.

---

## Screens

Most important information first.

Feedback is one page, scrolled top to bottom in the order the teaching
happens (ADR 0003): the teacher's message, then every change in the entry as
one list — in diff order, the reading order of the learner's own text, never
re-sorted by severity — then the whole corrected text, then the closing
block. `ambiguous` sits at the end of the changes section rather than
standing alone. The per-100-words number and any legacy score live in the
closing block: after the teaching, never before it, never in a header and
never in anything sticky. There is no swipe, no card stack, no card counter
and no progress bar — one gesture, vertical, the one the phone already
taught.

A card is a container, not a step. Sections are cards in a vertical list,
separated by a hairline rule on `bg-card`, and one section carries one idea.
A section may run as long as its one idea requires — "every change in this
entry" is one idea said N times, not N ideas. What a section must never do is
put a different *kind* of content under the same heading; if it mixes two
topics it is two sections. Legacy 9-agent-era content (pattern watch, fluency
notes, vocabulary, drills) sits between the corrected text and the closing
block, shown only on entries that carry it, and shrinks out of the app as
those entries age out.

Structure is carried by headings, not by gestures: one `<h1>` per screen,
`<h2>` per section in visual order, no skipped levels, and no screen moves
focus on mount.

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

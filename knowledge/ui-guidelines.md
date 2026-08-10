# UI Guidelines

## Design Philosophy

Simple.

Clean.

Professional.

A learner reads this screen after being told what they got wrong. Reduce
cognitive load, and never make the feedback feel like a scoreboard.

---

## Colors

Maintain consistent themes.

Avoid excessive colors.

High contrast.

Red marks the error, green marks the correction, amber marks the one thing to
fix. Do not add a fourth semantic colour without a reason.

Never carry meaning in colour alone — pair it with a label or a shape.

---

## Typography

Readable.

Clear hierarchy.

Consistent sizing.

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

Consistent shadows.

---

## Screens

Most important information first.

On Feedback that order is: the one thing to fix, then the corrected text, then
the individual corrections. Scores come after the teaching, never before it.

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

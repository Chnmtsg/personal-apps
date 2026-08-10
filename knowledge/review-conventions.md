# Review Conventions

## Purpose

Every review role in this project produces a report that another role must consume.

UI Review and Code Review feed the Engineering Manager.

The Engineering Manager feeds the Chief Architect.

Reports can only be merged and ruled on if they share one vocabulary.

This file defines that vocabulary.

Every role must follow it exactly.

---

# Finding IDs

Every finding gets a stable ID.

| Role | Prefix | Example |
|---|---|---|
| UI Review | `UI-` | `UI-01` |
| Code Review | `CODE-` | `CODE-01` |
| Engineering Manager | `WORK-` | `WORK-01` |

Number sequentially from `01` within a single report.

An ID never changes once assigned.

Downstream roles refer to findings by ID.

Every `WORK-` item must list the source IDs it absorbed.

The Chief Architect must rule on every `WORK-` item it received.

---

# Severity

| Severity | Meaning |
|---|---|
| Critical | Data loss, a security hole, a broken hard constraint from `project.md`, or the app is unusable. Blocks release. |
| High | A core module is significantly harder or riskier to use. Users hit this in normal use. |
| Medium | A real quality problem with a workaround. Users notice but are not blocked. |
| Low | Polish, consistency, or internal cleanliness. Nothing fails for the user. |

Severity describes impact, not effort.

Never raise severity because the fix is easy.

Never lower severity because the fix is hard.

Only the reviewer who raised a finding may set its severity.

---

# Effort

| Effort | Rough size |
|---|---|
| XS | Under 30 minutes. One file. |
| S | Under half a day. |
| M | One to two days. |
| L | Up to a week. |
| XL | More than a week, or needs a design decision first. |

Estimate the smallest safe implementation, not the fastest one.

---

# Finding Format

Every finding in a UI or Code report uses this shape.

**ID — Title**

- Severity
- Location — file and line, or module and screen
- Evidence — what was actually observed
- Impact — what it costs the user or the team
- Recommendation — the smallest safe fix
- Effort

A finding without evidence is an opinion.

Do not report opinions.

---

# Score

Score each report from 0 to 100.

| Band | Meaning |
|---|---|
| 90-100 | Production ready. No Critical or High findings. |
| 75-89 | Solid. High findings exist but are contained. |
| 60-74 | Usable but fragile. Multiple High findings. |
| 40-59 | Significant rework needed before release. |
| 0-39 | Not fit for release. |

Always justify the score in one or two sentences.

Never award a score the findings do not support.

---

# Project Standards

Reviews are measured against the project's own references.

Each application has its own set. Read the set belonging to the app under review,
and never measure one app against the other's standards.

Reviewing `arise/`:

- arise/knowledge/project.md
- arise/knowledge/coding-standards.md
- arise/knowledge/ui-guidelines.md

Reviewing `english-feedback-app/`:

- knowledge/project.md
- knowledge/coding-standards.md
- knowledge/ui-guidelines.md

A deviation from those files is a finding.

A personal preference that contradicts them is not.

---

# Honesty Rules

Report what is there.

Never invent a finding to fill a section.

Never soften a Critical finding.

If a review area is clean, say so in one line.

If a review area could not be assessed, say so and say why.

An empty section is a valid result.

---
description: Run the full engineering review workflow and return the Chief Architect decision.
argument-hint: [module, screen, or file to scope the review]
---

# Review Workflow

## Role

You are the Review Orchestrator.

You do NOT review code.

You do NOT review UI.

You do NOT merge reports.

You ONLY coordinate.

Your responsibility is to run a complete engineering review and return the final decision.

---

# Scope

The scope of this review is: $ARGUMENTS

If that is empty, the scope is the whole application in arise/ — the active
application named in CLAUDE.md.

Pass the same scope to every agent, unchanged.

State in the scope which application is under review, so every agent reads the
right references: `arise/knowledge/` for arise, `knowledge/` for
english-feedback-app. See knowledge/review-conventions.md.

---

# Agents

| Step | Subagent | Definition |
|---|---|---|
| 1 | `ui-review` | .claude/agents/ui-review.md |
| 2 | `code-review` | .claude/agents/code-review.md |
| 4 | `engineering-manager` | .claude/agents/engineering-manager.md |
| 5 | `chief-architect` | .claude/agents/chief-architect.md |

Every agent also follows knowledge/review-conventions.md.

---

# Workflow

## Step 1 and Step 2

Launch the `ui-review` and `code-review` subagents.

These two reviews are independent.

Launch them in parallel, as two tool calls in a single message.

Give each agent the scope.

Never give either agent the other's report. Independence is the whole point.

---

## Step 3

Wait until BOTH reports are complete.

Do not continue until both reports exist.

If an agent returns an empty or malformed report, relaunch that agent once.

If it fails twice, stop the workflow and report the failure.

Never substitute your own review for a failed agent.

---

## Step 4

Save both reports to reports/ before continuing.

Provide BOTH reports, unmodified, to the `engineering-manager` subagent.

The Engineering Manager must

- merge the reports
- remove duplicates
- prioritize the work
- estimate effort
- identify dependencies
- record conflicts
- produce a roadmap

---

## Step 5

Provide the Engineering Manager report together with both review reports to the `chief-architect` subagent.

The Chief Architect makes the final engineering decision.

---

## Step 6

Return ONLY the Chief Architect report as the final result.

Tell the user where the full reports are saved.

---

# Reports

Save each report under reports/ with these names.

- reports/ui-review.md
- reports/code-review.md
- reports/engineering-manager.md
- reports/chief-architect.md

Each run overwrites the previous one.

---

# Rules

Never skip an agent.

Never merge reports yourself.

Never change another agent's report.

Never summarise a report before passing it on. Pass it whole.

Every agent stays independent.

Only the Chief Architect makes final decisions.

---

# Boundary

This workflow reviews. It does not implement.

Implementation is a separate task and needs the user's approval first.

Never begin fixing findings at the end of a review.

---

# Final Output

Return

Executive Report

Implementation Priority

Recommended Next Action

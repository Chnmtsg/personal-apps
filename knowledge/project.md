# English Feedback Project

## Project Vision

English Feedback is a writing-feedback application for one learner: a native
Mongolian speaker, a geologist in mining, at roughly IELTS 4.0–4.5, aiming at
IELTS 7.5 and professional business English.

The goal is NOT to correct a piece of writing. A chat can do that, and the
correction disappears when the conversation does.

The goal is to make error *patterns* visible over time. Every correction is
stored with a category, so after two hundred entries the application can say
"articles: 47 errors this month — your number one pattern" and show every past
example of it.

---

## Core Modules

A core module is one the application ships today and can be reached by name.

| Module | Where it lives |
|---|---|
| Write | Tab bar — the entry editor, with a 30-word minimum and draft autosave |
| Feedback | Reached by opening an analysed entry; corrections, patterns, scores, CEFR |
| Error log | Tab bar, labelled **Errors** — top patterns, the trend chart, all-time totals, per-category examples |
| History | Tab bar — every entry with its status |
| Settings | Tab bar — privacy statement, export, delete all |

**Error log** is the module that carries the vision. Everything else feeds it.
Its per-category example list is what turns a pile of corrections into
something a learner can study.

The **trend** is deliberately errors per **100 words**, not raw error counts.
Raw counts rise as entries get longer, so they would show a learner getting
worse while improving. Do not add a raw-count chart alongside it.

---

## Architecture

Two deployed pieces plus shared code.

| Folder | What it is |
|---|---|
| `app/` | React + TypeScript + Vite PWA. Tailwind, IndexedDB via `idb`, Recharts, `vite-plugin-pwa`. |
| `worker/` | Cloudflare Worker proxy. Holds the Anthropic API key, enforces the origin allowlist and rate limit, calls the model with structured output. |
| `shared/` | The Zod feedback schema, the error-category taxonomy, and the teaching system prompt — imported by both. |

The PWA never calls `api.anthropic.com`. The key exists only as a Worker secret.

---

## Project Principles

The application must be

- Private by default — entries live only on the device
- Offline-first — writing must never be blocked by the network
- Fast
- Simple
- Mobile-friendly
- Easy to understand

---

## Hard Constraints

These are not preferences. Breaking one is a Critical finding.

1. **The API key never reaches the client.** Not in code, not in `[vars]`, not
   in a build-time variable.
2. **An entry is never lost.** It is written to IndexedDB before any network
   call, and every failure path leaves the text readable in History.
3. **The category taxonomy is versioned data.** The 20 categories in
   `shared/schema.ts` are stored inside every past entry. Renaming or removing
   one silently rewrites history — treat a change as a migration.
4. **Stored feedback stays interpretable.** Each entry records the `modelId`
   and `promptVersion` it was judged under. Bump `PROMPT_VERSION` whenever
   `TEACHING_SYSTEM_PROMPT` changes.
5. **The system prompt is byte-identical on every request.** It is a cached
   prefix; interpolating anything into it silently disables prompt caching.
6. **The worker logs counts, never entry text.**

---

## Model Behaviour That Constrains the Code

`MODEL_ID` is `claude-opus-5`. Two properties of it are load-bearing:

- **Thinking is on by default,** and `max_tokens` bounds thinking *and*
  response text together. A `max_tokens` sized for the response alone truncates
  under load. This is why the worker sets it explicitly and why truncation is
  reported as a permanent failure rather than a retryable one.
- **Safety classifiers can decline a request** with `stop_reason: "refusal"` on
  an HTTP 200. That is a verdict on the text, not an outage — it must never be
  retried.

---

## Target User

One learner, at A2+/B1, reading feedback written in English.

Feedback must be readable at that level. A correction without a reason teaches
nothing, so every correction carries a one-sentence rule.

---

## Long-term Vision

Not built. Do not describe these as if they ship.

- Spaced repetition over past errors
- Speaking / pronunciation feedback
- Multi-device sync
- Exercises generated from the learner's own error patterns

# Coding Standards

## General

Always write readable code.

Never optimize prematurely.

Keep functions small.

One responsibility per function.

Avoid duplication.

Use meaningful names.

Write code that reads like the code around it — match the surrounding comment
density, naming, and idiom.

---

## Comments

Comment to state something the code cannot: a constraint, a reason, a
non-obvious consequence.

Never comment to narrate what the next line does, or to record that a change
was made. That is a note to the reviewer, and it is noise once merged.

---

## TypeScript

`strict` is on everywhere and stays on.

Model states you actually have. A discriminated union that makes an impossible
state unrepresentable beats a bag of optional fields.

Never use `any`. Prefer `unknown` at boundaries and narrow it.

Validate everything that crosses a trust boundary — network responses included —
with the shared Zod schema, not with a cast.

Export types with `export type` so the import can be erased.

---

## React

Keep components presentational where possible; put logic in `lib/`.

Anything computed from stored data belongs in a pure function in `lib/`, not
inline in a component. That is what makes it testable.

Memoize derived data that walks the full entry history.

Every `useEffect` that loads data must handle rejection. A screen that renders
`null` while a promise never settles is a blank screen with no explanation.

---

## Pure Logic

Correctness-critical logic goes in a module with no runtime imports from the
browser or the Worker runtime — no IndexedDB, no `fetch`, no `import.meta.env`.

That is not a style rule. It is what allows `tests/` to run under plain Node
with no test framework, no DOM shim, and no build step.

Current examples: `lib/highlight.ts`, `lib/retry.ts`, `lib/stats.ts`,
`worker/src/policy.ts`.

---

## Error Handling

Distinguish transient from permanent failure at the boundary that knows the
difference, and carry that distinction across the wire. A client that cannot
tell them apart will either retry forever or give up on a blip.

Every retry loop needs a ceiling.

Handle errors where you can do something about them. Log where you cannot.

Never swallow an error silently.

---

## Cloudflare Worker

Secrets are secrets (`wrangler secret put`), never `[vars]`.

Validate the request before spending anything — quota, tokens, or money.

Never log user text. Log counts, codes, and categories.

Trust no client-supplied header for anything that matters, `Content-Length`
included.

---

## CSS

Mobile first.

Use Tailwind utilities; reach for a component class only when a pattern repeats.

Keep theme consistent.

---

## Tests

Cover the logic where a mistake is silent: retry policy, statistics, text
matching, request validation.

A test asserts behaviour a user or a caller depends on. Name it after that
behaviour, not after the function.

When fixing a bug, add the test that would have caught it, and say so in the
test.

---

## Project Rules

Never modify unrelated files.

Never break existing functionality.

Always preserve backward compatibility — including the shape of data already
written to a user's device.

Always explain major changes.

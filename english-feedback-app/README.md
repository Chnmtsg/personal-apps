# English Feedback — writing feedback PWA with persistent error tracking

A chat gives you one correction and it disappears. This app stores **every correction with a
category**, so after 200 entries it can say: *"Articles: 47 errors this month — your #1 pattern."*

Two parts:

| Folder | What it is |
|---|---|
| `app/` | React + TypeScript + Vite PWA (Tailwind, IndexedDB via `idb`, Recharts, `vite-plugin-pwa`) |
| `worker/` | Cloudflare Worker proxy that holds the Anthropic API key, rate-limits, and runs the pipeline: ONE runtime agent (`claude-opus-5`, structured output) surrounded by deterministic code |
| `shared/` | The Zod schemas, the teacher prompt, the error taxonomy v2 with Mongolian contrast notes (`taxonomy.ts`), and the Top-100 pattern list (`patterns.ts`) — shared by both |
| `prompts/`, `knowledge/`, `docs/` | Runtime prompt sources, the source documents (taxonomy, patterns, the full 9-agent library), and the architecture + decision records |
| `tests/` | Node's built-in test runner over the pure logic — no framework, no build step |

The pipeline per entry (see `docs/architecture.md` and `docs/adr/0001`): a
deterministic regex matcher fixes known Top-100 patterns before any model
call; then ONE agent — the teacher — checks risk (a crisis is never turned
into a grammar lesson), corrects minimally, flags ambiguity instead of
guessing, labels its own changes with taxonomy categories, and writes the
day's feedback (at most 3 corrections mentioned); then a code diff computes
every changed span from the learner's own text, and pattern-sourced edits are
labelled straight from the taxonomy. The full 9-agent library lives in
`knowledge/agent_prompts.md` and grows back one agent at a time, by decision
record.

The PWA **never** talks to `api.anthropic.com` directly. The key exists only as a Worker secret.

---

## 1. Run locally

> **Run every command in this section from the repo root**
> (`english-feedback-app/`), not from `app/` or `worker/`. The `dev:worker`,
> `dev:app`, `verify` and `build` scripts live in the root `package.json`; the
> sub-packages only have `dev`, `deploy` and `check`. Running `npm run dev:worker`
> inside `worker/` fails with `Missing script`.

Install once, at the repo root:

```powershell
npm install
```

Copy the dev secrets file, then paste your real API key into it:

```powershell
copy worker\.dev.vars.example worker\.dev.vars
```

Terminal 1 — the proxy, on `http://127.0.0.1:8787`:

```powershell
npm run dev:worker
```

Terminal 2 — the app, on `http://localhost:5173`:

```powershell
npm run dev:app
```

> Paste each command on its own, with nothing after it. `cmd.exe` does not treat
> `#` as a comment, so a trailing note gets passed through to the command as
> arguments and it fails.

`app/.env.development` already points `VITE_API_URL` at the local worker. It is
deliberately **not** `app/.env`: a plain `.env` applies to every mode, so the
localhost URL would be compiled into production builds.

Check the proxy is alive, then smoke-test it (build order step 1):

```powershell
curl http://127.0.0.1:8787/health
```

```powershell
curl -X POST http://127.0.0.1:8787/analyze -H "Content-Type: application/json" -d '{\"text\": \"Yesterday I go to mine site. I geologist, I take three sample from drill core, it was very interesting day for me and my colleague he help me a lot.\"}'
```

`curl` sends no `Origin` header, so this works while `ALLOWED_ORIGIN` is `"*"`.
Once you lock the allowlist down it will correctly return `403 origin_not_allowed` —
that is the control working, not a bug.

## 2. Verify

```powershell
npm run verify
```

Typechecks `app`, `worker`, and `tests`, then runs the test suite. `npm run build`
and `npm run deploy:worker` both run it first, so a broken build cannot ship.

Tests only:

```powershell
npm test
```

Typechecks only:

```powershell
npm run check
```

## 3. Deploy the Worker

These commands run from `worker/`. Remember to `cd ..` back to the repo root
afterwards, or the root scripts in sections 1, 2 and 4 will report
`Missing script`.

```powershell
cd worker
```

```powershell
npx wrangler login
```

Create the rate-limit namespace, then paste the id it prints into
`wrangler.toml` and uncomment the `[[kv_namespaces]]` block:

```powershell
npx wrangler kv namespace create RATE_LIMIT_KV
```

Store the API key as a secret — it prompts you to paste it:

```powershell
npx wrangler secret put ANTHROPIC_API_KEY
```

```powershell
npx wrangler deploy
```

**Set `ALLOWED_ORIGIN` in `wrangler.toml` before you deploy.** While it is `"*"`,
the deployed worker is an unauthenticated relay in front of your paid API key that
anyone who finds the URL can spend. Set it to your app's origin:

```toml
ALLOWED_ORIGIN = "https://english-feedback.pages.dev"
```

Optionally add a second gate, setting the same value as `VITE_APP_KEY` in
`app/.env.production`:

```powershell
npx wrangler secret put APP_KEY
```

The worker then requires a matching `X-App-Key` header. The value ships inside a
public bundle, so it stops casual abuse and scripted scraping — it is not
authentication, and it does not replace the origin allowlist.

Without the KV namespace the worker still rate-limits, but only per-isolate
(best-effort). With KV, the 20 requests/hour/IP limit survives across isolates.
It is read-then-write, so two simultaneous requests can overshoot by one; it
caps sustained spend rather than acting as a hard security boundary.

## 4. Deploy the app

Back at the repo root. Copy the template, then edit it so `VITE_API_URL` is your
deployed Worker URL (`https://english-feedback-proxy.<your-subdomain>.workers.dev`):

```powershell
copy app\.env.production.example app\.env.production
```

Build — this outputs `app/dist`:

```powershell
npm run build
```

Publish it. Cloudflare Pages is the natural fit, but any static host works:

```powershell
cd app
```

```powershell
npx wrangler pages deploy dist
```

The build **fails** if `VITE_API_URL` is missing, not `https`, or points at
localhost. `VITE_API_URL` is inlined at build time, so a wrong value is not
something you notice at startup — it is baked into an installed PWA that
silently fails every analysis.

Open the deployed URL on the phone → browser menu → **Add to Home Screen** to install.

---

## How the hard constraints are met

- **Key never in client code** — the app calls only `VITE_API_URL/analyze`; the key is a Worker
  secret (`grep -ri "sk-ant" app/src` returns nothing).
- **Access control** — origin allowlist enforced server-side (the matched origin is echoed, never
  `*`), plus an optional `X-App-Key` shared secret compared in constant time.
- **Rate limiting** — 20 req/hour/IP (KV-backed), charged only immediately before the upstream
  call, so malformed or rejected requests never consume the budget. 10 KB max body, measured in
  bytes rather than UTF-16 units. JSON-only, empty bodies rejected.
- **Offline-first** — drafts autosave to IndexedDB ~500 ms after each keystroke; entries created
  offline are queued and analysed automatically on reconnect; the service worker precaches the
  app shell so it opens in airplane mode.
- **Correctness by construction** — the Worker corrects the entry, then diffs its own output against
  the submitted text (`worker/src/diff.ts`) to find every changed span. A model is only ever asked to
  *label* a span the diff already found (category, severity, rule), never to invent one — so a
  correction's `original`/`corrected` text can't drift from what's actually in the entry.
- **Structured output** — each pipeline call uses `client.messages.parse` + `zodOutputFormat(...)`;
  the app re-validates the final result with the shared schema before storing, so no free-text
  categories can reach storage.
- **Fixed taxonomy** — the 20-category enum lives in `shared/schema.ts`; treat it as versioned data.
- **Any learner** — first language, work or study, level and goal are set in Settings, all
  optional, stored on the device, and sent as context with each analysis. They never touch a
  system prompt: that would give every user their own cache entry. Where a curated contrastive
  dossier exists for the first language it is used; otherwise the model uses its own knowledge;
  with no language given it does not guess.
- **Privacy** — entries live only in IndexedDB; only the analysed text and this profile ever leave the device; the
  Worker logs error counts and refusal categories, never entry text; Settings has a plain-language
  statement, export, and delete-all.
- **Prompt caching** — the teacher prompt is one byte-identical cached block for every user; the
  response includes `cache.read`/`cache.write` so you can verify reads climb from the second
  request onward.
- **Refusals** — `stop_reason: "refusal"` returns a friendly state; the entry is kept, never lost,
  and never retried, because a refusal is a verdict on the text rather than an outage.
- **Bounded retries** — every failure is classified transient or permanent, and a transient one is
  retried at most 5 times before the entry is marked failed with its text intact. Rate limiting
  does not consume that budget.
- **Trend metric** — errors per **100 words**, not raw counts.
- **Versioned feedback** — each entry stores `modelId` and `promptVersion` alongside the feedback.

## Cost

One entry is **1 to 3 Anthropic calls** on `claude-opus-5` ($5/$25 per Mtok): one teacher call,
plus up to 2 in-request retries if it over-rewrites (see `MAX_REWRITE_RATIO`). The deterministic
pattern matcher fixes what it can for free before the model runs, and its prompt is one cached
prefix for every user. Real cost is **unmeasured** — measure your own first entries.
`output_config.effort` in `worker/src/pipeline.ts` is the lever: currently `"medium"`.

`max_tokens` covers thinking *and* the response together; sizing it for the response alone
truncates the call. To switch models, change `MODEL_ID` in `shared/schema.ts`.

## Known gaps

- The worker's request handler has no integration test; only the pure pieces it calls
  (`worker/src/policy.ts`, `worker/src/patterns.ts`, `worker/src/diff.ts`,
  `worker/src/sentences.ts`, `worker/src/learner.ts`) are covered. Testing the full `fetch`
  handler, or `worker/src/pipeline.ts`'s orchestration of the nine agents, needs Miniflare.
- The app bundle is ~635 KB (188 KB gzipped), dominated by Recharts. Fine over a warm service
  worker, worth code-splitting if first load matters.
- Rate limiting is per-IP and read-then-write; a determined abuser with many IPs is not stopped
  by it.
- The corrector's over-rewrite threshold and the client's 540s request timeout are both sized from
  theoretical worst cases, not observed behaviour — see `english-feedback-app/CLAUDE.md`'s Known Gaps.

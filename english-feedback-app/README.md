# English Feedback — writing feedback PWA with persistent error tracking

A chat gives you one correction and it disappears. This app stores **every correction with a
category**, so after 200 entries it can say: *"Articles: 47 errors this month — your #1 pattern."*

Two parts:

| Folder | What it is |
|---|---|
| `app/` | React + TypeScript + Vite PWA (Tailwind, IndexedDB via `idb`, Recharts, `vite-plugin-pwa`) |
| `worker/` | Cloudflare Worker proxy that holds the Anthropic API key, rate-limits, and calls `claude-opus-5` with structured output |
| `shared/` | The Zod feedback schema, error-category taxonomy, and the teaching system prompt — shared by both |
| `tests/` | Node's built-in test runner over the pure logic — no framework, no build step |

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
- **Structured output** — the Worker uses `client.messages.parse` + `zodOutputFormat(FeedbackSchema)`;
  the app re-validates with the same schema before storing, so no free-text categories can reach
  storage.
- **Fixed taxonomy** — the 20-category enum lives in `shared/schema.ts`; treat it as versioned data.
- **Privacy** — entries live only in IndexedDB; only the analysed text ever leaves the device; the
  Worker logs error counts and refusal categories, never entry text; Settings has a plain-language
  statement, export, and delete-all.
- **Prompt caching** — the teaching prompt is a byte-identical cached system block; the response
  includes `cache.read` so you can verify it's > 0 from the second request onward.
- **Refusals** — `stop_reason: "refusal"` returns a friendly state; the entry is kept, never lost,
  and never retried, because a refusal is a verdict on the text rather than an outage.
- **Bounded retries** — every failure is classified transient or permanent, and a transient one is
  retried at most 5 times before the entry is marked failed with its text intact. Rate limiting
  does not consume that budget.
- **Trend metric** — errors per **100 words**, not raw counts.
- **Versioned feedback** — each entry stores `modelId` and `promptVersion` alongside the feedback.

## Cost

`claude-opus-5` is $5 / $25 per million tokens, and the teaching prompt is cached.

Note that this model **thinks by default**, which the earlier ~$0.023/entry estimate did not
account for — measure your own first few entries before relying on a figure. `output_config.effort`
in `worker/src/index.ts` is the lever: it is set to `"medium"`, and `"low"` is a meaningful
saving if the feedback quality holds up for you.

`max_tokens` is 16000 because that ceiling covers thinking *and* the response together; sizing it
for the response alone truncates longer entries.

To switch models, change `MODEL_ID` in `shared/schema.ts` — nothing else.

## Known gaps

- The worker's request handler has no integration test; only its pure policy logic
  (`worker/src/policy.ts`) is covered. Testing the full `fetch` handler needs Miniflare.
- The app bundle is ~635 KB (188 KB gzipped), dominated by Recharts. Fine over a warm service
  worker, worth code-splitting if first load matters.
- Rate limiting is per-IP and read-then-write; a determined abuser with many IPs is not stopped
  by it.

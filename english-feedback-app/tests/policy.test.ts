import { test } from "node:test";
import assert from "node:assert/strict";
import {
  corsHeaders,
  parseAnalyzeBody,
  resolveOrigin,
  safeEqual,
} from "../worker/src/policy.ts";

const MAX = 10 * 1024;
const bodyOf = (value: unknown) => {
  const raw = JSON.stringify(value);
  return parseAnalyzeBody(raw, new TextEncoder().encode(raw).length, MAX);
};

// Comfortably over MIN_WORDS (30), so tests unrelated to length don't trip
// the too_short gate.
const LONG_ENOUGH =
  "Yesterday I went to the site with my team to collect samples from the " +
  "new drill hole and we found an interesting mineral there for the next " +
  "phase of the project which made everyone quite happy about the results.";

test("a wildcard config allows any origin, including none", () => {
  assert.equal(resolveOrigin("*", "https://anything.example"), "*");
  assert.equal(resolveOrigin(undefined, null), "*");
});

test("a configured allowlist echoes only the origins on it", () => {
  const allow = "https://app.pages.dev, https://staging.pages.dev";
  assert.equal(resolveOrigin(allow, "https://app.pages.dev"), "https://app.pages.dev");
  assert.equal(resolveOrigin(allow, "https://staging.pages.dev"), "https://staging.pages.dev");
  assert.equal(resolveOrigin(allow, "https://evil.example"), null);
});

test("a request with no Origin is refused once an allowlist is configured", () => {
  assert.equal(resolveOrigin("https://app.pages.dev", null), null);
});

test("origin matching is exact, not a prefix or suffix match", () => {
  const allow = "https://app.pages.dev";
  assert.equal(resolveOrigin(allow, "https://app.pages.dev.evil.example"), null);
  assert.equal(resolveOrigin(allow, "https://evil-app.pages.dev"), null);
  assert.equal(resolveOrigin(allow, "http://app.pages.dev"), null);
});

test("a refused origin gets no grant, and every response varies on Origin", () => {
  assert.equal(corsHeaders(null)["Access-Control-Allow-Origin"], "null");
  assert.equal(corsHeaders("https://app.pages.dev").Vary, "Origin");
});

test("key comparison accepts only an exact match", () => {
  assert.equal(safeEqual("s3cret", "s3cret"), true);
  assert.equal(safeEqual("s3cret", "s3crey"), false);
  assert.equal(safeEqual("s3cret", "s3cre"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual("", "s3cret"), false);
});

test("accepts a well-formed entry, with an empty history by default", () => {
  assert.deepEqual(bodyOf({ text: LONG_ENOUGH }), {
    ok: true,
    text: LONG_ENOUGH,
    history: [],
  });
});

test("rejects empty, unparseable, and textless bodies", () => {
  assert.deepEqual(parseAnalyzeBody("", 0, MAX), {
    ok: false,
    status: 400,
    error: "empty_body",
  });
  assert.deepEqual(parseAnalyzeBody("{ not json", 10, MAX), {
    ok: false,
    status: 400,
    error: "invalid_json",
  });
  for (const value of [{}, { text: 42 }, { text: "" }, { text: "   \n " }]) {
    assert.deepEqual(bodyOf(value), { ok: false, status: 400, error: "missing_text" });
  }
});

test("rejects an entry shorter than MIN_WORDS before it can spend anything", () => {
  assert.deepEqual(bodyOf({ text: "I am geologist" }), {
    ok: false,
    status: 400,
    error: "too_short",
  });
});

test("history defaults to empty when absent, malformed, or not an array", () => {
  for (const history of [undefined, null, "not an array", 42, { category: "spelling" }]) {
    assert.deepEqual(bodyOf({ text: LONG_ENOUGH, history }), {
      ok: true,
      text: LONG_ENOUGH,
      history: [],
    });
  }
});

test("a valid history is passed through", () => {
  const history = [
    { category: "articles", count: 12 },
    { category: "spelling", count: 3 },
  ];
  assert.deepEqual(bodyOf({ text: LONG_ENOUGH, history }), {
    ok: true,
    text: LONG_ENOUGH,
    history,
  });
});

test("malformed history entries are dropped, not rejected outright", () => {
  const history = [
    { category: "articles", count: 5 }, // kept
    { category: "not_a_real_category", count: 1 }, // unknown category
    { category: "spelling", count: -1 }, // negative count
    { category: "spelling", count: 1.5 }, // non-integer count
    { category: "spelling" }, // missing count
    { count: 5 }, // missing category
    "spelling", // not an object
    null,
  ];
  assert.deepEqual(bodyOf({ text: LONG_ENOUGH, history }), {
    ok: true,
    text: LONG_ENOUGH,
    history: [{ category: "articles", count: 5 }],
  });
});

test("history is capped at one entry per category", () => {
  const history = Array.from({ length: 50 }, () => ({ category: "spelling", count: 1 }));
  const result = bodyOf({ text: LONG_ENOUGH, history });
  assert.ok(result.ok);
  assert.ok(result.history.length <= 20);
});

test("the size limit counts bytes, not UTF-16 units", () => {
  // Cyrillic is one JS "character" but two UTF-8 bytes, so a length-based
  // check would let a body through at double the intended size.
  const cyrillic = "я".repeat(MAX - 100);
  const raw = JSON.stringify({ text: cyrillic });
  const bytes = new TextEncoder().encode(raw).length;
  assert.ok(bytes > raw.length, "expected the byte count to exceed the character count");
  assert.deepEqual(parseAnalyzeBody(raw, bytes, MAX), {
    ok: false,
    status: 413,
    error: "too_large",
  });
});

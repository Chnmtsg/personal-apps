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

test("accepts a well-formed entry", () => {
  assert.deepEqual(bodyOf({ text: "I am geologist" }), {
    ok: true,
    text: "I am geologist",
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

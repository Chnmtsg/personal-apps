import { test } from "node:test";
import assert from "node:assert/strict";
import { planImport } from "../app/src/lib/importEntries.ts";
import type { Entry } from "../app/src/lib/db.ts";

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    createdAt: 1_700_000_000_000,
    text: "some writing",
    wordCount: 40,
    status: "analysed",
    feedback: {
      corrected_text: "some writing",
      corrections: [],
    } as unknown as Entry["feedback"],
    ...over,
  };
}

// Raw, unvalidated JSON as it would arrive from a parsed export file.
function raw(over: Record<string, unknown> = {}): unknown {
  return {
    id: "e1",
    createdAt: 1_700_000_000_000,
    text: "some writing",
    wordCount: 40,
    status: "analysed",
    feedback: { corrected_text: "some writing", corrections: [] },
    ...over,
  };
}

test("a new entry is staged for writing", () => {
  const outcome = planImport([], [raw()]);
  assert.equal(outcome.imported, 1);
  assert.equal(outcome.skippedExisting, 0);
  assert.equal(outcome.invalid, 0);
  assert.equal(outcome.toWrite[0].id, "e1");
});

test("an id already on this device is skipped, never overwritten", () => {
  const outcome = planImport([entry({ id: "e1", text: "the version already here" })], [
    raw({ id: "e1", text: "an imported version" }),
  ]);
  assert.equal(outcome.imported, 0);
  assert.equal(outcome.skippedExisting, 1);
  assert.equal(outcome.toWrite.length, 0);
});

test("a record failing the shape check is counted invalid, never written", () => {
  const outcome = planImport([], [
    raw({ id: undefined }), // no id at all
    { not: "an entry" },
    raw({ wordCount: "forty" }), // wrong type
  ]);
  assert.equal(outcome.invalid, 3);
  assert.equal(outcome.imported, 0);
  assert.equal(outcome.toWrite.length, 0);
});

test("a null feedback (queued or failed entry) is accepted", () => {
  const outcome = planImport([], [raw({ status: "queued", feedback: null })]);
  assert.equal(outcome.invalid, 0);
  assert.equal(outcome.toWrite[0].feedback, null);
});

test("legacy feedback fields ride through unchanged rather than being stripped", () => {
  const outcome = planImport(
    [],
    [
      raw({
        feedback: {
          corrected_text: "x",
          corrections: [
            { original: "a", corrected: "b", category: "articles", severity: "minor", rule: "legacy rule text" },
          ],
          cefr_estimate: "B1",
          scores: { grammar: 70, vocabulary: 60, naturalness: 65 },
        },
      }),
    ]
  );
  const fb = outcome.toWrite[0].feedback as unknown as Record<string, unknown>;
  assert.equal(fb.cefr_estimate, "B1");
  assert.deepEqual(fb.scores, { grammar: 70, vocabulary: 60, naturalness: 65 });
  const corrections = fb.corrections as Array<Record<string, unknown>>;
  assert.equal(corrections[0].rule, "legacy rule text");
  assert.equal(corrections[0].category, "articles"); // legacy name, untouched — normalised at read time
});

// WORK-16: an imported claim has no holder. Without this, a fresh import
// could sit showing "checking now" for up to STALE_CLAIM_MS with nobody
// actually running the analysis.
test("an imported 'analysing' entry is requeued, since nothing on this device holds that claim", () => {
  const outcome = planImport([], [
    raw({ status: "analysing", analysingSince: 1_700_000_000_000, feedback: null }),
  ]);
  assert.equal(outcome.toWrite[0].status, "queued");
  assert.equal(outcome.toWrite[0].analysingSince, undefined);
});

test("a duplicate id within the file itself keeps the newer copy", () => {
  const outcome = planImport(
    [],
    [
      raw({ id: "dup", createdAt: 1_000, text: "older" }),
      raw({ id: "dup", createdAt: 2_000, text: "newer" }),
    ]
  );
  assert.equal(outcome.toWrite.length, 1);
  assert.equal(outcome.toWrite[0].text, "newer");
  assert.equal(outcome.imported, 1);
});

test("an empty file imports nothing and reports nothing", () => {
  const outcome = planImport([entry()], []);
  assert.deepEqual(outcome, { toWrite: [], imported: 0, skippedExisting: 0, invalid: 0 });
});

test("optional Entry metadata (attempts, modelId, taxonomyVersion) survives the round trip", () => {
  const outcome = planImport(
    [],
    [raw({ attempts: 2, modelId: "claude-opus-5", promptVersion: 7, taxonomyVersion: 2, failReason: "gave_up", status: "failed", feedback: null })]
  );
  const [written] = outcome.toWrite;
  assert.equal(written.attempts, 2);
  assert.equal(written.modelId, "claude-opus-5");
  assert.equal(written.promptVersion, 7);
  assert.equal(written.taxonomyVersion, 2);
  assert.equal(written.failReason, "gave_up");
});
